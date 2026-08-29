require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const IG_USER_ID = (process.env.IG_USER_ID || '').trim();
const IG_ACCESS_TOKEN = (process.env.IG_ACCESS_TOKEN || '').trim();

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const { generateCarouselImages, renderSlide, LAYOUTS } = require('./generateCards');
const { publishInstagramSingle, publishInstagramCarousel } = require('./instagramCarousel');

const CATEGORIES = [
    '가족여행', '육아', '경제', '부동산', '호기심천국', '생활팁', '결혼생활'
];

// 하루 3~4개 발행을 위한 황금 시간대 (오전 8:30 출근길 / 낮 12:30 점심 / 저녁 6:30 퇴근길 / 밤 9:30 휴식)
const OPTIMAL_HOURS = [
    { hour: 8, minute: 30 },
    { hour: 12, minute: 30 },
    { hour: 18, minute: 30 },
    { hour: 21, minute: 30 }
];

const FALLBACK_PRESETS = {
    '가족여행': {
        topic: '3대 가족이 함께 가도 절대 안 싸우는 힐링 여행 코스',
        keyword: 'family travel nature',
        bodyText: '아이 챙기랴 부모님 눈치 보랴 매번 지치셨나요? 😭\n동선은 짧고 만족도는 200%인 3대 가족 맞춤 힐링 여행 코스를 정리해 드립니다!\n\n이번 주말 가족들과 행복한 추억을 만들어보세요 ✨',
        hashtags: {
            core: ['#가족여행', '#3대여행', '#아이랑여행', '#부모님여행', '#가족여행지추천'],
            expand: ['#주말나들이', '#국내여행', '#힐링여행', '#여행꿀팁', '#가족휴가'],
            target: ['#육아맘', '#주말가족모임', '#키즈여행', '#효도여행', '#전국여행']
        },
        slides: [
            { type: 'cover', imageKeyword: 'family trip', title: '절대 안 싸우는\n3대 가족 여행 코스', subtitle: '아이도 부모님도 200% 만족하는 비결' },
            { type: 'body', imageKeyword: 'resort scenery', step: '01', title: '동선 최소화 리조트', content: '숙소 안에서 식사와 산책, 키즈존이 모두 해결되는 올인원 스팟을 선택하세요.' },
            { type: 'body', imageKeyword: 'delicious food', step: '02', title: '호불호 없는 식당 예약', content: '자극적인 메뉴 대신 정갈한 한식당이나 룸이 있는 개별 식당을 사전 예약합니다.' },
            { type: 'body', imageKeyword: 'relax forest', step: '03', title: '1일 1메인 일정 원칙', content: '욕심내서 여러 군데 돌지 말고, 오전 1곳 방문 후 오후는 무조건 휴식!' },
            { type: 'outro', imageKeyword: 'sunset family', title: '저장해두고 이번 주말\n여행 계획에 써먹어보세요!', subtitle: '좋아요 & 팔로우 부탁드립니다' }
        ]
    },
    '육아': {
        topic: '육아책 100권 읽어도 안 나오는 현실 육아 치트키',
        keyword: 'parenting baby lifestyle',
        bodyText: '떼쓰고 울 때 백날 논리적으로 설명해 봐야 안 통합니다! 🚨\n육아 피로도를 절반으로 줄여주는 실전 육아 꿀팁 3가지를 공개합니다.\n\n오늘 밤 빠른 육퇴를 원하신다면 지금 저장하세요!',
        hashtags: {
            core: ['#육아꿀팁', '#현실육아', '#육퇴', '#육아스타그램', '#육아치트키'],
            expand: ['#육아소통', '#육아맘', '#육아대디', '#맘스타그램', '#베이비인스타'],
            target: ['#돌끝맘', '#초보부모', '#육아일기', '#육아정보', '#육아필수템']
        },
        slides: [
            { type: 'cover', imageKeyword: 'cute baby', title: '현실 육아 치트키\n오늘 밤 육퇴 보장', subtitle: '지친 엄마 아빠를 위한 실전 생존 육아법' },
            { type: 'body', imageKeyword: 'playing toy', step: '01', title: '시선 전환 뇌 리셋', content: '떼쓸 땐 뜬금없이 "어? 저기 무슨 소리지?"라며 엉뚱한 곳을 가리키세요.' },
            { type: 'body', imageKeyword: 'baby bath', step: '02', title: '10분 컷 기절 목욕', content: '물 온도를 딱 38도에 맞추고 목욕 후 조명을 낮춰 수면 호르몬을 유도하세요.' },
            { type: 'body', imageKeyword: 'relax mom', step: '03', title: '죄책감 없는 생존 육아', content: '지친 날엔 배달음식과 짧은 영상 시청도 괜찮습니다. 부모 멘탈이 최우선!' },
            { type: 'outro', imageKeyword: 'sleeping baby', title: '저장해두고 육아로\n지칠 때마다 꺼내보세요!', subtitle: '좋아요 & 팔로우는 큰 힘이 됩니다' }
        ]
    },
    '경제': {
        topic: '통장에 돈이 저절로 쌓이는 3단 통장 쪼개기 법칙',
        keyword: 'finance money investment',
        bodyText: '월급날 스쳐 지나가는 통장 잔고 때문에 한숨 쉬셨나요? 💸\n사회초년생부터 맞벌이 부부까지 돈이 모이는 구조를 만드는 통장 쪼개기 핵심 공식을 정리했습니다.\n\n작은 습관 하나가 자산을 바꿉니다!',
        hashtags: {
            core: ['#재테크', '#통장쪼개기', '#월급관리', '#돈모으기', '#사회초년생'],
            expand: ['#경제상식', '#가계부', '#저축', '#파이프라인', '#금융공부'],
            target: ['#직장인재테크', '#부자되는법', '#통장관리', '#시드머니', '#재테크팁']
        },
        slides: [
            { type: 'cover', imageKeyword: 'money growth', title: '돈이 저절로 모이는\n통장 쪼개기 공식', subtitle: '월급 스쳐가는 사람들을 위한 자산 관리' },
            { type: 'body', imageKeyword: 'banking app', step: '01', title: '급여 및 고정지출 통장', content: '월급이 들어오면 공과금, 대출이자 등 고정비를 뺀 나머지를 즉시 분배합니다.' },
            { type: 'body', imageKeyword: 'wallet cash', step: '02', title: '생활비 전용 체크카드', content: '한 달 예산을 정해 체크카드 통장에 이체하고 잔액 안에서만 소비합니다.' },
            { type: 'body', imageKeyword: 'gold savings', step: '03', title: '비상금 & 투자 통장', content: 'CMA 계좌에 3~6개월 치 생활비를 묶어두고 추가 잉여자금은 투자로 연결!' },
            { type: 'outro', imageKeyword: 'success rich', title: '저장하고 이번 달 월급날\n바로 적용해보세요!', subtitle: '좋아요 & 팔로우로 재테크 꿀팁 받기' }
        ]
    },
    '부동산': {
        topic: '초보자도 10분 만에 끝내는 임장 필수 체크리스트',
        keyword: 'real estate apartment city',
        bodyText: '집 보러 갈 때 겉만 쓱 보고 계약했다가 후회하는 분들 많습니다! 🏢\n낮과 밤, 역세권과 학군, 누수 결로까지 현장에서 무조건 확인해야 할 체크리스트를 공개합니다.\n\n내 집 마련 전 반드시 저장하고 챙겨가세요!',
        hashtags: {
            core: ['#부동산', '#임장체크리스트', '#내집마련', '#아파트임장', '#부동산공부'],
            expand: ['#청약', '#신혼부부내집마련', '#부동산정보', '#부동산팁', '#집구하기'],
            target: ['#아파트청약', '#재개발', '#내집찾기', '#임장기록', '#부동산상식']
        },
        slides: [
            { type: 'cover', imageKeyword: 'modern building', title: '초보 임장러를 위한\n현장 필수 체크리스트', subtitle: '계약서 도장 찍기 전에 무조건 확인해야 할 것들' },
            { type: 'body', imageKeyword: 'walking street', step: '01', title: '낮과 밤 2번 방문하기', content: '낮에는 채광과 학원가를 보고, 밤에는 가로등 밝기와 주차 난이도를 확인하세요.' },
            { type: 'body', imageKeyword: 'apartment interior', step: '02', title: '수압 및 누수 흔적 체크', content: '싱크대와 욕실 물을 동시에 틀어보고 베란다 구석 결로 흔적을 꼼꼼히 살핍니다.' },
            { type: 'body', imageKeyword: 'subway train', step: '03', title: '실제 도보 시간 측정', content: '네이버 지도 시간 대신 출퇴근 시간에 직접 걸으며 신호등 대기시간까지 체크!' },
            { type: 'outro', imageKeyword: 'city skyline', title: '저장해두고 집 보러 갈 때\n하나씩 체크해보세요!', subtitle: '좋아요 & 팔로우 부탁드립니다' }
        ]
    },
    '호기심천국': {
        topic: '비행기 창문 아래 작은 구멍의 충격적인 비밀',
        keyword: 'airplane sky window',
        bodyText: '비행기 탈 때 창문 맨 아래 뚫려있는 작은 구멍 보신 적 있나요? ✈️\n단순한 장식이 아니라 탑승객의 안전을 지키는 엄청난 과학 원리가 숨어있습니다.\n\n알아두면 비행기 탈 때마다 써먹는 꿀잼 상식!',
        hashtags: {
            core: ['#호기심천국', '#비행기상식', '#상식퀴즈', '#알쓸신잡', '#과학상식'],
            expand: ['#흥미로운이야기', '#꿀잼상식', '#지식한스푼', '#여행상식', '#신비한잡학'],
            target: ['#비행기탑승', '#해외여행꿀팁', '#잡학다식', '#상식충전', '#생활지식']
        },
        slides: [
            { type: 'cover', imageKeyword: 'airplane window view', title: '비행기 창문에 뚫린\n작은 구멍의 비밀', subtitle: '알아두면 신기한 비행기 속 과학 이야기' },
            { type: 'body', imageKeyword: 'airplane flying', step: '01', title: '기압 조절 브리더 홀', content: '1만 미터 상공의 외부 기압과 따뜻한 기내 기압의 차이를 분산시켜 창문을 보호합니다.' },
            { type: 'body', imageKeyword: 'foggy glass', step: '02', title: '김 서림 방지 기능', content: '유리 층 사이의 습기를 배출하여 창문에 성에나 김이 서리는 것을 완벽히 방지합니다.' },
            { type: 'body', imageKeyword: 'flight cloud', step: '03', title: '3중 구조의 안전 유리', content: '구멍이 뚫린 판은 안쪽 보호용이며, 바깥쪽 2장의 유리가 비행기 압력을 지탱합니다.' },
            { type: 'outro', imageKeyword: 'sky horizon', title: '주변 친구들에게도\n이 신기한 상식을 공유해보세요!', subtitle: '좋아요 & 팔로우 부탁드립니다' }
        ]
    },
    '생활팁': {
        topic: '살림 고수들만 몰래 쓰는 만능 베이킹소다 활용법',
        keyword: 'clean kitchen lifestyle',
        bodyText: '주방 기름때, 탄 냄비, 신발장 악취 때문에 스트레스받으셨나요? 🧹\n비싼 세제 살 필요 없이 베이킹소다 하나로 끝내는 살림 꿀팁 3가지를 정리해 드립니다.\n\n오늘 바로 집에서 따라 해보세요!',
        hashtags: {
            core: ['#생활팁', '#살림꿀팁', '#베이킹소다활용법', '#청소꿀팁', '#살림노하우'],
            expand: ['#주부스타그램', '#자취꿀팁', '#살림스타그램', '#살림고수', '#청소스타그램'],
            target: ['#1인가구', '#신혼살림', '#주방청소', '#살림정보', '#생활정보']
        },
        slides: [
            { type: 'cover', imageKeyword: 'clean kitchen', title: '살림 고수의 비밀\n베이킹소다 만능 활용법', subtitle: '찌든 때부터 악취 제거까지 한 번에 끝내기' },
            { type: 'body', imageKeyword: 'cooking pot', step: '01', title: '탄 냄비 10분 복구', content: '베이킹소다 2스푼과 물을 넣고 10분간 끓인 뒤 식혀서 닦아내면 말끔히 제거됩니다.' },
            { type: 'body', imageKeyword: 'sink clean', step: '02', title: '배수구 냄새 완벽 차단', content: '베이킹소다 1컵을 배수구에 뿌리고 식초 1컵을 부어 거품이 일어난 뒤 뜨거운 물을 부으세요.' },
            { type: 'body', imageKeyword: 'white sneakers', step: '03', title: '신발장 제습 및 탈취', content: '작은 병에 베이킹소다를 담아 신발장 구석에 두면 습기와 냄새를 한 번에 싹 잡습니다.' },
            { type: 'outro', imageKeyword: 'tidy room', title: '저장해두고 대청소할 때\n하나씩 따라 해보세요!', subtitle: '좋아요 & 팔로우 부탁드립니다' }
        ]
    },
    '결혼생활': {
        topic: '부부싸움 90%를 예방하는 마법의 대화법',
        keyword: 'couple happy marriage love',
        bodyText: '사소한 집안일 하나로 시작해 큰 싸움으로 번진 적 있으시죠? 💍\n상대방 마음 상하지 않게 내 의사를 정확히 전달하는 나-전달법(I-Message) 대화 기술을 공개합니다.\n\n배우자와 함께 보고 공유해보세요!',
        hashtags: {
            core: ['#결혼생활', '#부부싸움예방', '#부부대화법', '#신혼부부', '#부부스타그램'],
            expand: ['#결혼스타그램', '#행복한부부', '#신혼일기', '#결혼장려', '#부부일상'],
            target: ['#예비부부', '#신혼생활', '#부부갈등해결', '#결혼공감', '#사랑꾼']
        },
        slides: [
            { type: 'cover', imageKeyword: 'happy couple', title: '부부싸움 90% 줄여주는\n마법의 대화 공식', subtitle: '서로 상처 주지 않고 마음을 전하는 법' },
            { type: 'body', imageKeyword: 'couple talking', step: '01', title: '"너 왜 그래" 금지', content: '상대방을 비난하는 "너(You)" 대신 내 감정을 표현하는 "나(I)"로 문장을 시작하세요.' },
            { type: 'body', imageKeyword: 'couple cooking', step: '02', title: '행동과 감정 분리하기', content: '"집안일 또 안 했네" 대신 "집이 어질러져 있어서 내가 오늘 조금 지쳤어"라고 말해보세요.' },
            { type: 'body', imageKeyword: 'couple walking', step: '03', title: '감정 격할 땐 타임아웃', content: '목소리가 커질 것 같으면 30분간 각자의 시간을 가진 뒤 차분해졌을 때 다시 대화합니다.' },
            { type: 'outro', imageKeyword: 'couple sunset', title: '소중한 배우자에게\n지금 이 카드를 공유해보세요!', subtitle: '좋아요 & 팔로우 부탁드립니다' }
        ]
    }
};

const DB_FILE = path.join(__dirname, 'posts.json');

function loadPosts() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
    }
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function savePosts(posts) {
    fs.writeFileSync(DB_FILE, JSON.stringify(posts, null, 2));
}

let autoPilotState = {
    enabled: false,
    interval: '6hours',
    autoSchedule: true,
    logs: []
};
let scheduledTask = null;

function addLog(message) {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const entry = `[${timestamp}] ${message}`;
    autoPilotState.logs.unshift(entry);
    if (autoPilotState.logs.length > 50) autoPilotState.logs.pop();
    console.log(entry);
}

// 🛡️ [4단계 자동화 검증 시스템 (Content Audit Pipeline)]
const FORBIDDEN_WORDS = ['100% 보장', '무조건 수익', '불법', '성인', '마약', '대출상담', '비밀리크', '원금보장', '도박'];

function auditContentQuality(parsed) {
    const fullText = `${parsed.topic || ''} ${parsed.bodyText || ''}`;
    
    // 1. 금칙어 검사
    for (const word of FORBIDDEN_WORDS) {
        if (fullText.includes(word)) {
            return { passed: false, reason: `금칙어 발견 [${word}]` };
        }
    }

    // 2. 정보 분량 검사
    if (!parsed.bodyText || parsed.bodyText.length < 40) {
        return { passed: false, reason: '본문 40자 미만 (정보성 부족)' };
    }

    // 3. 슬라이드 레이아웃 검사 (글자 짤림 방지)
    if (Array.isArray(parsed.slides)) {
        for (let i = 0; i < parsed.slides.length; i++) {
            const s = parsed.slides[i];
            if (s.title && s.title.length > 35) {
                return { passed: false, reason: `슬라이드 #${i + 1} 제목이 너무 깁니다 (35자 초과)` };
            }
            if (s.content && s.content.length > 120) {
                return { passed: false, reason: `슬라이드 #${i + 1} 본문이 너무 깁니다 (120자 초과)` };
            }
        }
    }

    return { passed: true };
}

function checkDuplicateTopic(newTopic) {
    const posts = loadPosts();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentPosts = posts.filter(p => new Date(p.createdAt).getTime() > thirtyDaysAgo);
    return recentPosts.some(p => p.topic && (p.topic.includes(newTopic) || newTopic.includes(p.topic)));
}

// 🔔 카카오톡 알림
let kakaoAccessToken = null;
async function getKakaoAccessToken() {
    const REST_API_KEY = process.env.KAKAO_CLIENT_ID;
    const REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;
    if (!REST_API_KEY || !REFRESH_TOKEN) return null;

    try {
        const res = await axios.post('https://kauth.kakao.com/oauth/token', null, {
            params: {
                grant_type: 'refresh_token',
                client_id: REST_API_KEY,
                refresh_token: REFRESH_TOKEN
            },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        kakaoAccessToken = res.data.access_token;
        return kakaoAccessToken;
    } catch (err) {
        return null;
    }
}

async function sendKakaoNotification(title, message, linkUrl = 'http://localhost:3000') {
    const token = await getKakaoAccessToken();
    if (!token) return;

    try {
        const template = {
            object_type: 'text',
            text: `[인스타 스튜디오 알림]\n\n📌 ${title}\n${message}`,
            link: { web_url: linkUrl, mobile_web_url: linkUrl },
            button_title: '게시물 확인'
        };

        await axios.post(
            'https://kapi.kakao.com/v2/api/talk/memo/default/send',
            `template_object=${encodeURIComponent(JSON.stringify(template))}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        addLog('💬 카카오톡 알림 전송 완료');
    } catch (err) { }
}

async function searchUnsplashImages(keyword, count = 5) {
    const backupImages = [
        `https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80`,
        `https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1080&q=80`,
        `https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1080&q=80`,
        `https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1080&q=80`,
        `https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1080&q=80`
    ];

    if (!UNSPLASH_ACCESS_KEY) return backupImages.slice(0, count);

    try {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=${count}&orientation=squarish&client_id=${UNSPLASH_ACCESS_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.results && data.results.length > 0) {
            return data.results.map(item => item.urls.regular);
        }
        return backupImages.slice(0, count);
    } catch (error) {
        return backupImages.slice(0, count);
    }
}

// 🌐 [실시간 구글 검색 Grounding 연동 Gemini 모델 인스턴스]
function getGeminiModel(generationConfig, enableSearch = false) {
    if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 없습니다.');
    const tools = enableSearch ? [{ googleSearch: {} }] : undefined;
    return genAI.getGenerativeModel({ 
        model: GEMINI_MODEL, 
        generationConfig,
        tools
    });
}

function getGeminiErrorMessage(error) {
    return error?.message || String(error);
}

function toAbsoluteUrl(req, url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    
    let base = (process.env.PUBLIC_BASE_URL || '').trim();
    if (!base) {
        const protocol = req?.protocol || 'http';
        const host = req?.get ? req.get('host') : `localhost:${port}`;
        base = `${protocol}://${host}`;
    }
    
    base = base.replace(/\/+$/, '');
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${base}${cleanUrl}`;
}

// 🎯 하루 3~4회 최적 배정 스케줄러 (08:30 / 12:30 / 18:30 / 21:30)
function getNextOptimalScheduleTime() {
    const now = new Date();
    
    for (let slot of OPTIMAL_HOURS) {
        let candidate = new Date(now);
        candidate.setHours(slot.hour, slot.minute, 0, 0);
        if (candidate > now) return candidate.toISOString();
    }

    let tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(OPTIMAL_HOURS[0].hour, OPTIMAL_HOURS[0].minute, 0, 0);
    return tomorrow.toISOString();
}

async function executePublishPost(req, post) {
    if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
        throw new Error('.env에 IG_USER_ID 및 IG_ACCESS_TOKEN이 필요합니다.');
    }

    let publishResult;
    if (Array.isArray(post.imageUrls) && post.imageUrls.length > 1) {
        const absoluteUrls = post.imageUrls.map(url => toAbsoluteUrl(req, url));
        publishResult = await publishInstagramCarousel(absoluteUrls, post.caption, IG_USER_ID, IG_ACCESS_TOKEN);
    } else {
        const targetImg = post.imageUrl || (post.imageUrls && post.imageUrls[0]);
        const absoluteUrl = toAbsoluteUrl(req, targetImg);
        publishResult = await publishInstagramSingle(absoluteUrl, post.caption, IG_USER_ID, IG_ACCESS_TOKEN);
    }
    return publishResult;
}

// ⏰ [예약 스케줄러]
cron.schedule('* * * * *', async () => {
    const posts = loadPosts();
    const now = new Date();
    let updated = false;

    for (let post of posts) {
        if (post.status === 'SCHEDULED' && post.scheduledAt) {
            const scheduledTime = new Date(post.scheduledAt);
            if (scheduledTime <= now) {
                addLog(`⏰ [예약 시간 도달] [${post.topic}] 자동 발행 시도...`);
                try {
                    const fakeReq = { protocol: 'https', get: () => process.env.PUBLIC_BASE_URL || `localhost:${port}` };
                    const publishResult = await executePublishPost(fakeReq, post);
                    post.status = 'PUBLISHED';
                    post.instagramPostId = publishResult.postId;
                    post.publishedAt = now.toISOString();
                    post.instagramPostUrl = publishResult.postUrl;
                    updated = true;
                    addLog(`🎉 [예약 자동발행 성공] Post ID: ${publishResult.postId}`);
                    await sendKakaoNotification(
                        '예약 콘텐츠 자동 발행 완료 🚀',
                        `주제: ${post.topic}\n링크: ${publishResult.postUrl}`,
                        publishResult.postUrl
                    );
                } catch (err) {
                    addLog(`❌ [예약 자동발행 실패] ${err.message}`);
                    post.status = 'FAILED';
                    post.lastError = err.message;
                    updated = true;
                }
            }
        }
    }

    if (updated) savePosts(posts);
});

// 🔄 [Auto-Pilot 무인 생성 파이프라인 (2단계 딥 리서치 + 4단계 품질 검증 완비)]
async function runAutoPilotPipeline(retryCount = 0) {
    const MAX_RETRIES = 3;
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    addLog(`🤖 [완전자동화 딥 리서치] [${randomCategory}] 실시간 웹 검색 및 팩트 분석 가동 (${retryCount + 1}/${MAX_RETRIES})`);

    try {
        let parsed;
        try {
            const model = getGeminiModel(undefined, true);
            const prompt = `
            너는 인스타그램 10만 팔로워를 보유한 전문 인사이트 큐레이터야.
            카테고리: [${randomCategory}]
            
            [1단계: 실시간 구글 검색 및 심층 분석]
            - 2026년 현재 [${randomCategory}] 분야에서 사람들이 가장 궁금해하고 반응이 폭발적인 최신 이슈/정책/명소/트렌드 1개를 실시간 검색해서 팩트를 수집해.
            - 뻔한 상식이 아닌, "구체적인 장소명, 수치, 방법론, 해결책"이 반드시 포함되어야 해.

            [2단계: 인스타그램 전용 포맷 빌드]
            - 첫 줄은 스크롤을 멈추게 하는 강력한 후킹 질문/경고/공감 문장(이모지 포함).
            - 본문은 3개의 핵심 포인트(1, 2, 3)로 요약 정리.

            반드시 아래 순수 JSON 포맷으로만 응답해:
            {
                "topic": "2026 실시간 트렌드를 반영한 구체적 제목 (30자 이내)",
                "keyword": "Unsplash 검색용 영어단어 1~2개",
                "bodyText": "해시태그 제외한 250자 이상의 완성형 인스타 본문",
                "hashtags": {
                    "core": ["#핵심1", "#핵심2", "#핵심3", "#핵심4", "#핵심5"],
                    "expand": ["#확장1", "#확장2", "#확장3", "#확장4", "#확장5"],
                    "target": ["#타깃1", "#타깃2", "#타깃3", "#타깃4", "#타깃5"]
                }
            }
            `;
            const result = await model.generateContent(prompt);
            const rawText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(rawText);

            // 1. 중복 검사
            if (checkDuplicateTopic(parsed.topic)) throw new Error('최근 30일 내 중복 주제 감지');
            // 2. 품질 및 가드레일 검사
            const audit = auditContentQuality(parsed);
            if (!audit.passed) throw new Error(audit.reason);

        } catch (apiErr) {
            addLog(`🛡️ [AI/검증 알림] ${apiErr.message} ➡️ 안전한 고품질 백업 프리셋으로 대체합니다.`);
            parsed = FALLBACK_PRESETS[randomCategory] || FALLBACK_PRESETS['가족여행'];
        }

        const candidateImages = await searchUnsplashImages(parsed.keyword, 5);
        const selectedImg = candidateImages[0];
        const allTags = [...(parsed.hashtags?.core || []), ...(parsed.hashtags?.expand || []), ...(parsed.hashtags?.target || [])].join(' ');
        const finalCaption = `${parsed.bodyText}\n\n${allTags}`;
        const scheduledTime = autoPilotState.autoSchedule ? getNextOptimalScheduleTime() : null;
        const targetStatus = autoPilotState.autoSchedule ? 'SCHEDULED' : 'DRAFT';

        const posts = loadPosts();
        posts.unshift({
            id: Date.now().toString(),
            category: randomCategory,
            topic: parsed.topic,
            title: parsed.topic,
            caption: finalCaption,
            bodyText: parsed.bodyText,
            hashtags: parsed.hashtags,
            imageUrl: selectedImg,
            candidateImages: candidateImages,
            imageUrls: [selectedImg],
            layout: 'modern',
            slides: [],
            status: targetStatus,
            scheduledAt: scheduledTime,
            publishedAt: null,
            createdAt: new Date().toISOString()
        });
        savePosts(posts);
        addLog(`💾 [사전 생성 & 예약 큐 보관 완료] [${parsed.topic}] ➡️ ${targetStatus === 'SCHEDULED' ? new Date(scheduledTime).toLocaleString('ko-KR') + ' 발행예정' : 'DRAFT'}`);
        await sendKakaoNotification('신규 콘텐츠 무인 수집 완료 ✅', `주제: ${parsed.topic}\n상태: ${targetStatus}`);

    } catch (error) {
        addLog(`❌ 파이프라인 오류: ${error.message}`);
        if (retryCount < MAX_RETRIES - 1) {
            setTimeout(() => runAutoPilotPipeline(retryCount + 1), 3000);
        }
    }
}

function setupCron(interval) {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    let cronTime = '0 */6 * * *';
    if (interval === '1min') cronTime = '*/1 * * * *';
    if (interval === '1hour') cronTime = '0 */1 * * *';
    if (interval === '24hours') cronTime = '0 9 * * *';

    scheduledTask = cron.schedule(cronTime, () => {
        if (autoPilotState.enabled) runAutoPilotPipeline();
    });
}

// [API 라우트]
app.get('/api/autopilot', (req, res) => res.json(autoPilotState));

app.post('/api/autopilot/toggle', (req, res) => {
    const { enabled, interval, autoSchedule } = req.body;
    autoPilotState.enabled = enabled;
    if (interval) autoPilotState.interval = interval;
    if (autoSchedule !== undefined) autoPilotState.autoSchedule = autoSchedule;

    if (enabled) {
        setupCron(autoPilotState.interval);
        addLog(`🟢 완전 자동화 가동 (주기: ${autoPilotState.interval})`);
        runAutoPilotPipeline();
    } else {
        if (scheduledTask) scheduledTask.stop();
        addLog(`🔴 완전 자동화 일시 중지`);
    }
    res.json({ success: true, state: autoPilotState });
});

// 🔍 [실시간 구글 검색 Grounding 연동 트렌드 분석 API]
app.get('/api/trends', async (req, res) => {
    const category = req.query.category || '가족여행';
    try {
        const model = getGeminiModel(undefined, true);
        const prompt = `
        구글 실시간 검색을 통해 2026년 현재 인스타그램에서 [${category}] 관련 대중들이 가장 뜨겁게 반응하는 최신 핫이슈, 실전 꿀팁, 고민 해결형 주제 5개를 추출해줘.
        단순한 단어 나열이 아니라 "실제 클릭하고 싶어지는 자극적이고 구체적인 후킹 제목"이어야 해.
        JSON 배열 형식으로만 응답해:
        ["주제 1", "주제 2", "주제 3", "주제 4", "주제 5"]
        `;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json({ success: true, trends: JSON.parse(text) });
    } catch (e) {
        const preset = FALLBACK_PRESETS[category] || FALLBACK_PRESETS['가족여행'];
        res.json({ 
            success: true, 
            trends: [
                preset.topic,
                `2026년 실패 없는 [${category}] 실전 압축 가이드`,
                `모르면 무조건 손해 보는 [${category}] 꿀팁 BEST 3`,
                `요즘 인스타에서 난리 난 [${category}] 핫트렌드`,
                `전문가가 몰래 쓰는 [${category}] 치트키`
            ] 
        });
    }
});

app.get('/api/search-images', async (req, res) => {
    const keyword = req.query.keyword || 'family trip';
    const images = await searchUnsplashImages(keyword, 5);
    res.json({ success: true, images });
});

app.get('/api/posts', (req, res) => res.json({ success: true, posts: loadPosts() }));

app.get('/api/posts/export', (req, res) => {
    const posts = loadPosts();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=instagram_posts_backup_${Date.now()}.json`);
    res.send(JSON.stringify(posts, null, 2));
});

app.post('/api/posts/import', (req, res) => {
    try {
        const importedPosts = req.body.posts;
        if (!Array.isArray(importedPosts)) {
            return res.status(400).json({ success: false, message: '올바른 JSON 배열 형식이 아닙니다.' });
        }
        savePosts(importedPosts);
        addLog(`📂 [데이터 복구] ${importedPosts.length}건의 콘텐츠 보관함이 정상 복원되었습니다.`);
        res.json({ success: true, count: importedPosts.length });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/posts/save', (req, res) => {
    const { id, category, topic, caption, bodyText, hashtags, imageUrl, candidateImages, imageUrls, layout, slides, status, scheduledAt } = req.body;
    let posts = loadPosts();
    const existingIndex = id ? posts.findIndex(p => p.id === id) : -1;

    const postPayload = {
        id: id || Date.now().toString(),
        category: category || '일반',
        topic: topic || '일반 콘텐츠',
        caption: caption || '',
        bodyText: bodyText || '',
        hashtags: hashtags || { core: [], expand: [], target: [] },
        imageUrl: imageUrl || (imageUrls && imageUrls[0]) || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80',
        candidateImages: candidateImages || [],
        imageUrls: imageUrls || [],
        layout: layout || 'modern',
        slides: slides || [],
        status: status || 'DRAFT',
        scheduledAt: scheduledAt !== undefined ? scheduledAt : (existingIndex !== -1 ? posts[existingIndex].scheduledAt : null),
        updatedAt: new Date().toISOString()
    };

    if (existingIndex !== -1) {
        posts[existingIndex] = { ...posts[existingIndex], ...postPayload };
    } else {
        postPayload.createdAt = new Date().toISOString();
        posts.unshift(postPayload);
    }

    savePosts(posts);
    res.json({ success: true, post: postPayload });
});

app.post('/api/posts/status', (req, res) => {
    const { id, status } = req.body;
    let posts = loadPosts();
    posts = posts.map(p => {
        if (p.id === id) {
            p.status = status;
            if (status === 'DRAFT') p.scheduledAt = null;
        }
        return p;
    });
    savePosts(posts);
    res.json({ success: true, posts });
});

app.delete('/api/posts/:id', (req, res) => {
    let posts = loadPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    savePosts(posts);
    res.json({ success: true });
});

app.post('/api/generate', async (req, res) => {
    const { topic, instruction, currentCaption, tone, category } = req.body;
    const cat = category || '가족여행';
    let parsed;

    try {
        const model = getGeminiModel(undefined, true);
        let tonePrompt = tone ? `[스타일/톤]: ${tone} 분위기로 작성해줘.` : '';
        let prompt = currentCaption
            ? `[기존 글]: ${currentCaption}\n[수정 지시사항]: ${instruction || '없음'}\n${tonePrompt}\nJSON 형식 응답: {"keyword":"영어단어", "bodyText":"본문", "hashtags":{"core":["#태그1"], "expand":["#태그2"], "target":["#태그3"]}}`
            : `[주제]: ${topic || cat}\n[지시사항]: ${instruction || '없음'}\n${tonePrompt}\n구글 실시간 검색을 바탕으로 깊이 있는 팩트와 최신 팁을 포함한 완성형 캡션 작성. JSON 형식 응답: {"keyword":"영어단어", "bodyText":"본문", "hashtags":{"core":["#태그1"], "expand":["#태그2"], "target":["#태그3"]}}`;
        
        const result = await model.generateContent(prompt);
        parsed = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (apiError) {
        addLog(`🛡️ [API 한도 감지] [${cat}] 단일 피드 백업 프리셋으로 안전 생성합니다.`);
        const preset = FALLBACK_PRESETS[cat] || FALLBACK_PRESETS['가족여행'];
        parsed = {
            keyword: preset.keyword,
            bodyText: preset.bodyText,
            hashtags: preset.hashtags
        };
    }

    const candidateImages = await searchUnsplashImages(parsed.keyword, 5);
    const allTags = [...(parsed.hashtags?.core || []), ...(parsed.hashtags?.expand || []), ...(parsed.hashtags?.target || [])].join(' ');
    const finalCaption = `${parsed.bodyText}\n\n${allTags}`;

    res.json({
        success: true,
        imageUrl: candidateImages[0],
        candidateImages: candidateImages,
        keyword: parsed.keyword,
        bodyText: parsed.bodyText,
        hashtags: parsed.hashtags || { core: [], expand: [], target: [] },
        caption: finalCaption
    });
});

app.post('/api/generate-carousel', async (req, res) => {
    const { topic, layout, category, tone, instruction } = req.body;
    const cat = category || '가족여행';
    let aiData;

    try {
        const model = getGeminiModel({ responseMimeType: 'application/json' }, true);
        let tonePrompt = tone ? `[스타일/톤]: ${tone}` : '';
        let instructPrompt = instruction ? `[추가지시]: ${instruction}` : '';
        const prompt = `
        주제: "${topic || cat}".
        ${tonePrompt} ${instructPrompt}
        구글 실시간 검색을 반영해 2026년 최신 팩트와 명소, 꿀팁을 포함한 5장의 카드뉴스 작성.
        슬라이드 제목은 최대 35자, 본문은 최대 110자로 간결하게.
        JSON 응답:
        {
          "bodyText": "본문 설명글 (250자 이상)",
          "hashtags": { "core": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5"], "expand": ["#태그6", "#태그7", "#태그8", "#태그9", "#태그10"], "target": ["#태그11", "#태그12", "#태그13", "#태그14", "#태그15"] },
          "slides": [
            { "type": "cover", "imageKeyword": "travel", "title": "대형 후킹 제목", "subtitle": "부제목" },
            { "type": "body", "imageKeyword": "hotel", "step": "01", "title": "소제목 1", "content": "핵심 내용 1" },
            { "type": "body", "imageKeyword": "food", "step": "02", "title": "소제목 2", "content": "핵심 내용 2" },
            { "type": "body", "imageKeyword": "view", "step": "03", "title": "소제목 3", "content": "핵심 내용 3" },
            { "type": "outro", "imageKeyword": "sunset", "title": "저장하세요", "subtitle": "좋아요 & 팔로우" }
          ]
        }
        `;
        const result = await model.generateContent(prompt);
        aiData = JSON.parse(result.response.text());
        
        // 품질 감사
        const audit = auditContentQuality({ topic, bodyText: aiData.bodyText, slides: aiData.slides });
        if (!audit.passed) throw new Error(audit.reason);

    } catch (apiError) {
        addLog(`🛡️ [AI/검증 알림] ${apiError.message} ➡️ [${cat}] 카드뉴스 백업 프리셋으로 안전 생성합니다.`);
        const preset = FALLBACK_PRESETS[cat] || FALLBACK_PRESETS['가족여행'];
        aiData = {
            bodyText: preset.bodyText,
            hashtags: preset.hashtags,
            slides: JSON.parse(JSON.stringify(preset.slides))
        };
        if (topic && topic !== preset.topic) {
            aiData.slides[0].title = topic;
        }
    }

    try {
        for (const slide of aiData.slides) {
            const candidates = await searchUnsplashImages(slide.imageKeyword || 'scenery', 1);
            slide.imageUrl = candidates[0];
        }

        const selectedLayout = LAYOUTS[layout] ? layout : 'modern';
        const imageUrls = await generateCarouselImages(aiData.slides, { layout: selectedLayout });

        const allTags = [...(aiData.hashtags?.core || []), ...(aiData.hashtags?.expand || []), ...(aiData.hashtags?.target || [])].join(' ');
        const finalCaption = `${aiData.bodyText}\n\n${allTags}`;

        const newId = Date.now().toString();
        const posts = loadPosts();
        posts.unshift({
            id: newId,
            category: cat,
            topic: topic || (aiData.slides[0] && aiData.slides[0].title) || '카드뉴스 콘텐츠',
            caption: finalCaption,
            bodyText: aiData.bodyText,
            hashtags: aiData.hashtags,
            imageUrl: imageUrls[0],
            imageUrls: imageUrls,
            layout: selectedLayout,
            slides: aiData.slides,
            status: 'DRAFT',
            createdAt: new Date().toISOString()
        });
        savePosts(posts);

        res.json({
            success: true,
            id: newId,
            caption: finalCaption,
            bodyText: aiData.bodyText,
            hashtags: aiData.hashtags,
            imageUrls: imageUrls,
            layout: selectedLayout,
            slides: aiData.slides
        });
    } catch (renderError) {
        console.error('렌더링 에러:', renderError);
        res.status(500).json({ success: false, message: '렌더링 실패: ' + renderError.message });
    }
});

app.post('/api/rerender-slide', async (req, res) => {
    try {
        const { slide, index, total, layout } = req.body;
        const selectedLayout = LAYOUTS[layout] ? layout : 'modern';
        const imageUrl = await renderSlide(slide, index, total, { layout: selectedLayout });
        res.json({ success: true, imageUrl });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/rerender-all', async (req, res) => {
    try {
        const { slides, layout } = req.body;
        const selectedLayout = LAYOUTS[layout] ? layout : 'modern';
        const imageUrls = await generateCarouselImages(slides, { layout: selectedLayout });
        res.json({ success: true, imageUrls });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/publish-now', async (req, res) => {
    const { postId, imageUrls, imageUrl, caption } = req.body;
    try {
        addLog(`🚀 [인스타그램 즉시 발행 시도] 게시물 처리를 시작합니다...`);
        const postObj = { imageUrls, imageUrl, caption };
        const publishResult = await executePublishPost(req, postObj);

        if (postId) {
            let posts = loadPosts();
            const idx = posts.findIndex(p => p.id === postId);
            if (idx !== -1) {
                posts[idx].status = 'PUBLISHED';
                posts[idx].instagramPostId = publishResult.postId;
                posts[idx].instagramPostUrl = publishResult.postUrl;
                posts[idx].publishedAt = new Date().toISOString();
                savePosts(posts);
            }
        }

        addLog(`🎉 [인스타그램 발행 성공] Post ID: ${publishResult.postId}`);
        await sendKakaoNotification(
            '인스타그램 피드 발행 성공 🚀',
            `게시물 링크: ${publishResult.postUrl}`,
            publishResult.postUrl
        );

        res.json({ success: true, ...publishResult });
    } catch (error) {
        addLog(`❌ [발행 실패] ${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
});

// UI 대시보드
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>인스타그램 스튜디오</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
        </head>
        <body class="bg-slate-100 p-6">
            <div class="max-w-7xl mx-auto space-y-6">
                <header class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">📸 인스타그램 크리에이터 스튜디오</h1>
                        <p class="text-xs text-slate-500 mt-1">완전자동화 Auto-Pilot & 구글 실시간 딥 리서치 분석 시스템</p>
                    </div>

                    <div class="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-slate-700">⚡ 완전 무인 자동화 (Auto-Pilot)</span>
                            <div class="flex items-center gap-2 mt-1">
                                <select id="autoInterval" class="text-xs border border-slate-300 rounded p-1 bg-white">
                                    <option value="1min">테스트 (1분 주기)</option>
                                    <option value="1hour">1시간마다 실행</option>
                                    <option value="6hours" selected>6시간마다 실행 (일 4회)</option>
                                    <option value="24hours">매일 오전 9시</option>
                                </select>
                                <label class="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" id="autoScheduleCheck" checked class="rounded text-indigo-600"> 자동 예약큐 등록
                                </label>
                            </div>
                        </div>
                        <button id="autoToggleBtn" onclick="toggleAutoPilot()" class="px-5 py-2.5 rounded-lg font-bold text-sm bg-slate-300 text-slate-700 transition">
                            자동화 OFF
                        </button>
                    </div>
                </header>
                
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div class="lg:col-span-7 space-y-6">
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <div class="mb-4">
                                <label class="block text-sm font-semibold text-slate-700 mb-2">🎯 관심 카테고리 선택 (클릭 시 즉시 전환)</label>
                                <div class="flex flex-wrap gap-2" id="categoryChips">
                                    <button onclick="selectCategory('가족여행')" class="cat-chip px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm transition">🏖️ 가족여행</button>
                                    <button onclick="selectCategory('육아')" class="cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition">🍼 육아</button>
                                    <button onclick="selectCategory('경제')" class="cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition">📈 경제</button>
                                    <button onclick="selectCategory('부동산')" class="cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition">🏢 부동산</button>
                                    <button onclick="selectCategory('호기심천국')" class="cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition">💡 호기심천국</button>
                                    <button onclick="selectCategory('생활팁')" class="cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition">🧹 생활팁</button>
                                    <button onclick="selectCategory('결혼생활')" class="cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition">💍 결혼생활</button>
                                </div>
                            </div>

                            <div class="flex justify-between items-center mb-3">
                                <label class="text-sm font-semibold text-slate-700">🔥 실시간 구글 검색 트렌드 분석 주제</label>
                                <button onclick="fetchTrends()" class="text-xs text-indigo-600 hover:underline">🔄 새로고침</button>
                            </div>
                            <div id="trendList" class="space-y-2 mb-4">
                                <div class="text-sm text-slate-400">트렌드를 불러오는 중...</div>
                            </div>

                            <label class="block text-sm font-semibold text-slate-700 mb-2">✍️ 직접 주제 입력 (비워두면 선택한 카테고리로 생성)</label>
                            <input type="text" id="customTopic" class="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-4" placeholder="직접 다루고 싶은 주제 입력 (선택사항)">

                            <!-- AI 스타일 선택 패널 -->
                            <label class="block text-sm font-semibold text-slate-700 mb-2">✨ AI 스타일 / 톤앤매너 선택</label>
                            <div class="flex flex-wrap gap-2 mb-4">
                                <button type="button" onclick="setTone('🔥 후킹 강화')" class="tone-btn px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-xs font-semibold rounded-lg border border-slate-200 transition">🔥 후킹 강화</button>
                                <button type="button" onclick="setTone('😊 친근하게')" class="tone-btn px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-xs font-semibold rounded-lg border border-slate-200 transition">😊 친근하게</button>
                                <button type="button" onclick="setTone('💰 마케팅형')" class="tone-btn px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-xs font-semibold rounded-lg border border-slate-200 transition">💰 마케팅형</button>
                                <button type="button" onclick="setTone('🎯 전문가 스타일')" class="tone-btn px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-xs font-semibold rounded-lg border border-slate-200 transition">🎯 전문가</button>
                                <button type="button" onclick="setTone('✂️ 짧고 임팩트있게')" class="tone-btn px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-xs font-semibold rounded-lg border border-slate-200 transition">✂️ 짧게</button>
                            </div>
                            <input type="hidden" id="selectedTone" value="">

                            <label class="block text-sm font-semibold text-slate-700 mb-2">💡 추가 지시 및 수정 요구사항</label>
                            <textarea id="instruction" class="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-4" rows="2" placeholder="예: '첫 문장을 더 자극적으로', '구체적 수치 포함'"></textarea>

                            <label class="block text-sm font-semibold text-slate-700 mb-2">🎨 카드뉴스 디자인 템플릿</label>
                            <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2" id="layoutSelector">
                                <button type="button" onclick="selectLayout('modern')" data-layout="modern" class="layout-btn p-2 rounded-lg border-2 border-indigo-500 bg-indigo-50 text-indigo-700 text-xs font-bold transition">01 모던</button>
                                <button type="button" onclick="selectLayout('editorial')" data-layout="editorial" class="layout-btn p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold transition">02 에디토리얼</button>
                                <button type="button" onclick="selectLayout('split')" data-layout="split" class="layout-btn p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold transition">03 스플릿</button>
                                <button type="button" onclick="selectLayout('card')" data-layout="card" class="layout-btn p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold transition">04 카드</button>
                                <button type="button" onclick="selectLayout('minimal')" data-layout="minimal" class="layout-btn p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold transition">05 미니멀</button>
                            </div>
                            <p id="layoutDescription" class="text-[11px] text-slate-400 mb-4">강한 후킹 + 대형 제목 + 포인트 바</p>

                            <div class="flex gap-3">
                                <button id="genBtn" onclick="handleGenerate(false)" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg shadow transition">
                                    ✨ 단일 이미지 생성
                                </button>
                                <button id="genCarouselBtn" onclick="handleGenerateCarousel()" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg shadow transition">
                                    🎨 카드뉴스 생성
                                </button>
                            </div>
                        </div>

                        <!-- 슬라이드 편집 & 개별 사진 교체 패널 -->
                        <div id="slideEditorSection" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4" style="display: none;">
                            <div class="flex justify-between items-center">
                                <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    ✏️ <span id="currentSlideLabel">표지 슬라이드 편집</span>
                                </h3>
                                <button onclick="rerenderCurrentSlide()" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition">
                                    ⚡ 텍스트 즉시 반영
                                </button>
                            </div>

                            <div class="space-y-3">
                                <div id="stepFieldWrapper" style="display: none;">
                                    <label class="block text-xs font-semibold text-slate-600 mb-1">스텝 번호 / 키워드</label>
                                    <input type="text" id="editSlideStep" oninput="onSlideFieldInput()" class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-slate-600 mb-1">제목 (Title)</label>
                                    <input type="text" id="editSlideTitle" oninput="onSlideFieldInput()" class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold">
                                </div>
                                <div id="subtitleFieldWrapper">
                                    <label class="block text-xs font-semibold text-slate-600 mb-1">부제목 (Subtitle)</label>
                                    <input type="text" id="editSlideSubtitle" oninput="onSlideFieldInput()" class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                                </div>
                                <div id="contentFieldWrapper" style="display: none;">
                                    <label class="block text-xs font-semibold text-slate-600 mb-1">본문 설명 (Content)</label>
                                    <textarea id="editSlideContent" oninput="onSlideFieldInput()" rows="3" class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                                </div>
                            </div>

                            <div class="pt-3 border-t border-slate-100">
                                <div class="flex justify-between items-center mb-2">
                                    <label class="text-xs font-bold text-indigo-700 flex items-center gap-1">
                                        🖼️ 현재 슬라이드 사진 교체
                                    </label>
                                    <div class="flex items-center gap-1.5">
                                        <input type="text" id="slidePhotoKeyword" placeholder="영문/한글 검색어 (예: family)" class="border border-slate-300 rounded-lg p-1 text-xs w-40">
                                        <button onclick="searchSlidePhotos()" class="text-xs bg-slate-800 hover:bg-black text-white px-2.5 py-1 rounded-lg">검색</button>
                                    </div>
                                </div>
                                <div id="slidePhotoGrid" class="grid grid-cols-5 gap-2"></div>
                            </div>
                        </div>

                        <!-- 이미지 썸네일 / 단일 이미지 후보 선택 그리드 -->
                        <div id="candidateImageSection" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200" style="display: none;">
                            <div class="flex justify-between items-center mb-3">
                                <label class="text-sm font-semibold text-slate-700" id="candidateTitle">🖼️ 이미지 후보 선택 (클릭하여 적용)</label>
                                <div class="flex items-center gap-2" id="manualSearchBox">
                                    <input type="text" id="manualImageKeyword" placeholder="새 키워드 검색" class="border border-slate-300 rounded-lg p-1 text-xs">
                                    <button onclick="searchImagesManual()" class="text-xs bg-slate-800 text-white px-2.5 py-1 rounded-lg">검색</button>
                                </div>
                            </div>
                            <div id="candidateGrid" class="grid grid-cols-5 gap-2"></div>
                        </div>

                        <!-- 해시태그 패널 -->
                        <div id="hashtagManagerSection" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200" style="display: none;">
                            <div class="flex justify-between items-center mb-3">
                                <h3 class="text-sm font-bold text-slate-800">🏷️ 해시태그 3단 분류 시스템</h3>
                                <span class="text-[11px] text-slate-400">클릭하여 본문 캡션에 추가/제거</span>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <span class="text-xs font-bold text-indigo-600 block mb-1">📌 핵심 태그 (Core)</span>
                                    <div id="coreTagList" class="flex flex-wrap gap-1.5"></div>
                                </div>
                                <div>
                                    <span class="text-xs font-bold text-purple-600 block mb-1">🚀 확장 태그 (Expand)</span>
                                    <div id="expandTagList" class="flex flex-wrap gap-1.5"></div>
                                </div>
                                <div>
                                    <span class="text-xs font-bold text-emerald-600 block mb-1">🎯 타깃/지역 태그 (Target)</span>
                                    <div id="targetTagList" class="flex flex-wrap gap-1.5"></div>
                                </div>
                            </div>
                        </div>

                        <!-- 캡션 에디터 & 예약 설정 바 -->
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                            <div class="flex justify-between items-center">
                                <label class="text-sm font-semibold text-slate-700">📝 캡션 직접 편집</label>
                                <div class="flex items-center gap-2">
                                    <span id="captionLengthBadge" class="text-[11px] text-slate-400">0자 / 태그 0개</span>
                                    <button onclick="copyCaption()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition font-semibold flex items-center gap-1">
                                        <i class="fa-regular fa-copy"></i> 캡션 복사
                                    </button>
                                    <button onclick="saveCurrentDraft()" class="text-xs bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-300 transition font-semibold">💾 임시저장</button>
                                </div>
                            </div>
                            <textarea id="captionEditor" oninput="syncCaption()" class="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none h-32" placeholder="생성된 글이 표시되며 직접 수정할 수 있습니다."></textarea>
                            
                            <div class="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                                <div class="flex items-center gap-2">
                                    <i class="fa-regular fa-calendar-check text-indigo-600"></i>
                                    <span class="text-xs font-bold text-indigo-900">예약 일시 설정:</span>
                                    <input type="datetime-local" id="scheduleInput" class="text-xs border border-indigo-200 rounded-lg p-1.5 bg-white text-slate-700">
                                </div>
                                <button onclick="scheduleCurrentPost()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition">
                                    📅 이 시간에 예약 발행 등록
                                </button>
                            </div>
                        </div>

                        <!-- 보관함 및 필터 탭 -->
                        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
                                <div class="flex items-center gap-2">
                                    <h3 class="text-sm font-bold text-slate-800">📋 콘텐츠 보관함</h3>
                                    <span id="queueBadge" class="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">0건</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="flex bg-slate-100 p-1 rounded-lg text-xs" id="postFilterTabs">
                                        <button onclick="setFilter('ALL')" class="px-2 py-0.5 rounded-md font-bold bg-white text-slate-800 shadow-sm" data-filter="ALL">전체</button>
                                        <button onclick="setFilter('SCHEDULED')" class="px-2 py-0.5 rounded-md text-slate-500 hover:text-slate-800" data-filter="SCHEDULED">예약</button>
                                        <button onclick="setFilter('PUBLISHED')" class="px-2 py-0.5 rounded-md text-slate-500 hover:text-slate-800" data-filter="PUBLISHED">완료</button>
                                        <button onclick="setFilter('DRAFT')" class="px-2 py-0.5 rounded-md text-slate-500 hover:text-slate-800" data-filter="DRAFT">임시</button>
                                    </div>
                                    <button onclick="exportDataJson()" title="JSON 내보내기" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg transition font-semibold">📥 백업</button>
                                    <label title="JSON 가져오기" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg transition font-semibold cursor-pointer">
                                        📤 복원
                                        <input type="file" id="importFileInput" onchange="importDataJson(event)" class="hidden" accept=".json">
                                    </label>
                                    <button onclick="loadPostList()" class="text-xs text-indigo-600 hover:underline">🔄</button>
                                </div>
                            </div>
                            <div id="postStorageList" class="space-y-3 max-h-60 overflow-y-auto">
                                <div class="text-xs text-slate-400">저장된 콘텐츠를 불러오는 중...</div>
                            </div>
                        </div>

                        <div class="bg-slate-900 text-emerald-400 p-4 rounded-2xl shadow-sm font-mono text-xs h-28 overflow-y-auto" id="logConsole">
                            <div>> [시스템 준비 완료] 대시보드 구동 중...</div>
                        </div>
                    </div>

                    <!-- 목업 창 -->
                    <div class="lg:col-span-5 flex justify-center">
                        <div class="w-full max-w-sm bg-white border border-slate-300 rounded-3xl shadow-xl overflow-hidden flex flex-col h-fit sticky top-6">
                            <div class="p-4 flex items-center justify-between border-b border-slate-100">
                                <div class="flex items-center space-x-2">
                                    <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-600 p-[2px]">
                                        <div class="w-full h-full bg-slate-200 rounded-full"></div>
                                    </div>
                                    <span class="text-xs font-bold text-slate-800">my_instastudio</span>
                                </div>
                                <span id="slideIndicator" class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full" style="display: none;">1 / 5</span>
                            </div>

                            <div class="w-full aspect-square bg-slate-100 overflow-hidden relative group">
                                <img id="mockImage" src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80" class="w-full h-full object-cover">
                                
                                <button id="prevSlideBtn" onclick="navigateSlide(-1)" class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition" style="display: none;">❮</button>
                                <button id="nextSlideBtn" onclick="navigateSlide(1)" class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition" style="display: none;">❯</button>
                            </div>

                            <div class="p-3 border-b border-slate-50 flex justify-between items-center text-base text-slate-700">
                                <div class="flex space-x-3">
                                    <i class="fa-regular fa-heart"></i>
                                    <i class="fa-regular fa-comment"></i>
                                    <i class="fa-regular fa-paper-plane"></i>
                                </div>
                                
                                <div class="flex items-center gap-2">
                                    <button onclick="downloadCurrentImage()" title="현재 이미지 다운로드" class="text-slate-600 hover:text-indigo-600 text-sm"><i class="fa-solid fa-download"></i></button>
                                    <button id="zipDownloadBtn" onclick="downloadAllZip()" title="5장 전체 ZIP 다운로드" class="text-xs bg-slate-800 text-white px-2.5 py-1 rounded-lg hover:bg-black font-semibold flex items-center gap-1" style="display: none;"><i class="fa-solid fa-file-zipper"></i> ZIP</button>
                                </div>
                            </div>

                            <div class="p-4 flex-1 overflow-y-auto max-h-36 text-xs text-slate-800 leading-relaxed">
                                <span class="font-bold mr-1">my_instastudio</span>
                                <span id="mockCaption" class="whitespace-pre-line text-slate-700">게시글 미리보기가 표시됩니다.</span>
                            </div>

                            <div class="p-4 bg-slate-50 border-t border-slate-200">
                                <button id="publishNowBtn" onclick="publishDirectToInstagram()" class="w-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-bold py-3 rounded-xl shadow hover:opacity-95 transition flex items-center justify-center gap-2">
                                    🚀 인스타그램에 실제 바로 게시
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                let currentPostId = null;
                let currentCategory = "가족여행";
                let selectedTopic = "";
                let isAutoEnabled = false;
                let currentCandidateImages = [];
                let currentImageUrl = '';
                let selectedLayout = 'modern';
                let generatedImageUrls = [];
                let currentSlides = [];
                let currentSlideIndex = 0;
                let currentBodyText = '';
                let currentHashtags = { core: [], expand: [], target: [] };
                let selectedTags = new Set();
                let currentFilter = 'ALL';
                let allPostsCache = [];

                const layoutDescriptions = {
                    modern: '강한 후킹 + 대형 제목 + 포인트 바',
                    editorial: '매거진형 대형 번호/제목 배치 + 다크 글래스',
                    split: '좌측 컬러 패널 + 우측 대형 콘텐츠',
                    card: '사진 배경 위 대형 플로팅 카드 레이아웃',
                    minimal: '여백과 가독성 중심의 깔끔한 구성'
                };

                window.addEventListener('DOMContentLoaded', () => {
                    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
                    nextHour.setMinutes(0);
                    const localISO = new Date(nextHour.getTime() - (nextHour.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                    document.getElementById('scheduleInput').value = localISO;
                });

                function setTone(toneName) {
                    document.querySelectorAll('.tone-btn').forEach(btn => {
                        btn.className = "tone-btn px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-xs font-semibold rounded-lg border border-slate-200 transition";
                    });
                    event.target.className = "tone-btn px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg border border-indigo-600 transition shadow-sm";
                    document.getElementById('selectedTone').value = toneName;
                }

                async function selectLayout(layout) {
                    selectedLayout = layout;
                    document.querySelectorAll('.layout-btn').forEach(btn => {
                        const active = btn.dataset.layout === layout;
                        btn.className = active
                            ? 'layout-btn p-2 rounded-lg border-2 border-indigo-500 bg-indigo-50 text-indigo-700 text-xs font-bold transition'
                            : 'layout-btn p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold transition';
                    });
                    document.getElementById('layoutDescription').innerText = layoutDescriptions[layout] || '';

                    if (currentSlides.length > 0) {
                        const res = await fetch('/api/rerender-all', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ slides: currentSlides, layout: selectedLayout })
                        });
                        const data = await res.json();
                        if (data.success) {
                            generatedImageUrls = data.imageUrls;
                            updateSlideViewer(currentSlideIndex);
                        }
                    }
                }

                function selectCategory(cat) {
                    currentCategory = cat;
                    document.querySelectorAll('.cat-chip').forEach(btn => {
                        if (btn.innerText.includes(cat)) {
                            btn.className = "cat-chip px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm transition";
                        } else {
                            btn.className = "cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition";
                        }
                    });
                    fetchTrends();
                }

                async function fetchTrends() {
                    const list = document.getElementById('trendList');
                    list.innerHTML = \`<div class="text-sm text-slate-400">[\${currentCategory}] 실시간 구글 검색 트렌드 분석 중...</div>\`;
                    try {
                        const res = await fetch(\`/api/trends?category=\${encodeURIComponent(currentCategory)}\`);
                        const data = await res.json();
                        list.innerHTML = '';
                        data.trends.forEach((t, i) => {
                            const item = document.createElement('div');
                            item.className = "p-2 border border-slate-200 rounded-lg text-xs text-slate-700 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition";
                            item.innerHTML = \`<span class="text-indigo-600 font-bold">\${i+1}.</span> \${t}\`;
                            item.onclick = () => {
                                document.querySelectorAll('#trendList div').forEach(el => el.classList.remove('bg-indigo-50', 'border-indigo-500'));
                                item.classList.add('bg-indigo-50', 'border-indigo-500');
                                selectedTopic = t;
                                document.getElementById('customTopic').value = t;
                            };
                            list.appendChild(item);
                        });
                    } catch (e) {
                        list.innerHTML = '<div class="text-xs text-slate-400">트렌드 로드 완료</div>';
                    }
                }

                function syncCaption() {
                    const val = document.getElementById('captionEditor').value || '';
                    document.getElementById('mockCaption').innerText = val || "게시글 내용이 표시됩니다.";
                    const tagCount = (val.match(/#[^\s#]+/g) || []).length;
                    document.getElementById('captionLengthBadge').innerText = \`\${val.length}자 / 태그 \${tagCount}개\`;
                }

                function copyCaption() {
                    const val = document.getElementById('captionEditor').value || '';
                    if (!val) return alert('복사할 캡션이 없습니다.');
                    navigator.clipboard.writeText(val).then(() => {
                        alert('📋 캡션이 클립보드에 복사되었습니다!');
                    });
                }

                function renderHashtags(hashtags) {
                    currentHashtags = hashtags || { core: [], expand: [], target: [] };
                    selectedTags.clear();

                    ['core', 'expand', 'target'].forEach(type => {
                        (currentHashtags[type] || []).forEach(t => selectedTags.add(t));
                    });

                    renderTagGroup('coreTagList', currentHashtags.core || [], 'border-indigo-200 text-indigo-700 bg-indigo-50');
                    renderTagGroup('expandTagList', currentHashtags.expand || [], 'border-purple-200 text-purple-700 bg-purple-50');
                    renderTagGroup('targetTagList', currentHashtags.target || [], 'border-emerald-200 text-emerald-700 bg-emerald-50');

                    document.getElementById('hashtagManagerSection').style.display = 'block';
                }

                function renderTagGroup(containerId, tags, activeClass) {
                    const container = document.getElementById(containerId);
                    container.innerHTML = '';
                    tags.forEach(tag => {
                        const chip = document.createElement('button');
                        const isSelected = selectedTags.has(tag);
                        chip.className = \`px-2.5 py-1 text-xs rounded-lg border transition font-medium \${isSelected ? activeClass + ' font-bold' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'}\`;
                        chip.innerText = tag;
                        chip.onclick = () => {
                            if (selectedTags.has(tag)) selectedTags.delete(tag);
                            else selectedTags.add(tag);
                            renderTagGroup(containerId, tags, activeClass);
                            updateCaptionFromTags();
                        };
                        container.appendChild(chip);
                    });
                }

                function updateCaptionFromTags() {
                    const tagsStr = Array.from(selectedTags).join(' ');
                    const finalCap = currentBodyText ? \`\${currentBodyText}\n\n\${tagsStr}\` : tagsStr;
                    document.getElementById('captionEditor').value = finalCap;
                    syncCaption();
                }

                function renderCandidateThumbnails(images) {
                    currentCandidateImages = images || [];
                    const grid = document.getElementById('candidateGrid');
                    grid.innerHTML = '';
                    document.getElementById('candidateTitle').innerText = '🖼️ 단일 이미지 후보 선택 (클릭하여 적용)';
                    document.getElementById('manualSearchBox').style.display = 'flex';

                    currentCandidateImages.forEach((url) => {
                        const img = document.createElement('img');
                        img.src = url;
                        img.className = "w-full aspect-square object-cover rounded-lg cursor-pointer border-2 hover:border-indigo-600 transition " + (url === currentImageUrl ? "border-indigo-600 scale-95 shadow-md" : "border-slate-200");
                        img.onclick = () => {
                            currentImageUrl = url;
                            document.getElementById('mockImage').src = url;
                            renderCandidateThumbnails(currentCandidateImages);
                        };
                        grid.appendChild(img);
                    });
                    document.getElementById('candidateImageSection').style.display = 'block';
                }

                function renderCarouselThumbnails() {
                    const grid = document.getElementById('candidateGrid');
                    grid.innerHTML = '';
                    document.getElementById('candidateTitle').innerText = '📑 슬라이드 5장 미리보기 (클릭하여 편집)';
                    document.getElementById('manualSearchBox').style.display = 'none';

                    generatedImageUrls.forEach((url, idx) => {
                        const wrapper = document.createElement('div');
                        wrapper.className = "relative cursor-pointer group";
                        const img = document.createElement('img');
                        img.src = url;
                        img.className = "w-full aspect-square object-cover rounded-lg border-2 transition " + (idx === currentSlideIndex ? "border-indigo-600 shadow-md scale-95" : "border-slate-200 hover:border-slate-400");
                        
                        const badge = document.createElement('span');
                        badge.className = "absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold";
                        badge.innerText = idx === 0 ? '표지' : (idx === generatedImageUrls.length - 1 ? '아웃트로' : \`\${idx}\`);

                        wrapper.onclick = () => updateSlideViewer(idx);
                        wrapper.appendChild(img);
                        wrapper.appendChild(badge);
                        grid.appendChild(wrapper);
                    });
                    document.getElementById('candidateImageSection').style.display = 'block';
                }

                function updateSlideViewer(idx) {
                    if (!generatedImageUrls[idx]) return;
                    currentSlideIndex = idx;
                    currentImageUrl = generatedImageUrls[idx];
                    document.getElementById('mockImage').src = currentImageUrl;

                    const ind = document.getElementById('slideIndicator');
                    ind.innerText = \`\${idx + 1} / \${generatedImageUrls.length}\`;
                    ind.style.display = 'inline-block';

                    document.getElementById('prevSlideBtn').style.display = 'flex';
                    document.getElementById('nextSlideBtn').style.display = 'flex';
                    document.getElementById('zipDownloadBtn').style.display = generatedImageUrls.length > 1 ? 'flex' : 'none';

                    renderCarouselThumbnails();
                    populateSlideEditor(idx);
                }

                function navigateSlide(dir) {
                    let next = currentSlideIndex + dir;
                    if (next < 0) next = generatedImageUrls.length - 1;
                    if (next >= generatedImageUrls.length) next = 0;
                    updateSlideViewer(next);
                }

                function populateSlideEditor(idx) {
                    if (!currentSlides || !currentSlides[idx]) {
                        document.getElementById('slideEditorSection').style.display = 'none';
                        return;
                    }
                    const s = currentSlides[idx];
                    const label = idx === 0 ? '표지 슬라이드 편집' : (idx === currentSlides.length - 1 ? '아웃트로 슬라이드 편집' : \`본문 슬라이드 \${s.step || idx} 편집\`);
                    document.getElementById('currentSlideLabel').innerText = label;

                    document.getElementById('editSlideTitle').value = s.title || '';
                    document.getElementById('editSlideSubtitle').value = s.subtitle || '';
                    document.getElementById('editSlideContent').value = s.content || '';
                    document.getElementById('editSlideStep').value = s.step || '';

                    document.getElementById('stepFieldWrapper').style.display = s.type === 'body' ? 'block' : 'none';
                    document.getElementById('contentFieldWrapper').style.display = s.type === 'body' ? 'block' : 'none';
                    document.getElementById('subtitleFieldWrapper').style.display = s.type === 'body' ? 'none' : 'block';

                    document.getElementById('slidePhotoKeyword').value = s.imageKeyword || '';
                    document.getElementById('slidePhotoGrid').innerHTML = '';

                    document.getElementById('slideEditorSection').style.display = 'block';
                }

                function onSlideFieldInput() {
                    if (!currentSlides[currentSlideIndex]) return;
                    currentSlides[currentSlideIndex].title = document.getElementById('editSlideTitle').value;
                    currentSlides[currentSlideIndex].subtitle = document.getElementById('editSlideSubtitle').value;
                    currentSlides[currentSlideIndex].content = document.getElementById('editSlideContent').value;
                    currentSlides[currentSlideIndex].step = document.getElementById('editSlideStep').value;
                }

                async function rerenderCurrentSlide() {
                    onSlideFieldInput();
                    const slide = currentSlides[currentSlideIndex];
                    const res = await fetch('/api/rerender-slide', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            slide,
                            index: currentSlideIndex,
                            total: currentSlides.length,
                            layout: selectedLayout
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        generatedImageUrls[currentSlideIndex] = data.imageUrl;
                        updateSlideViewer(currentSlideIndex);
                    }
                }

                async function searchSlidePhotos() {
                    const kw = document.getElementById('slidePhotoKeyword').value;
                    if (!kw) return alert('검색할 키워드를 입력해주세요.');
                    
                    const grid = document.getElementById('slidePhotoGrid');
                    grid.innerHTML = '<div class="text-[11px] text-slate-400 col-span-5">사진 검색 중...</div>';

                    try {
                        const res = await fetch(\`/api/search-images?keyword=\${encodeURIComponent(kw)}\`);
                        const data = await res.json();
                        if (data.success && data.images.length > 0) {
                            grid.innerHTML = '';
                            data.images.forEach(imgUrl => {
                                const img = document.createElement('img');
                                img.src = imgUrl;
                                img.className = "w-full aspect-square object-cover rounded-lg cursor-pointer border-2 hover:border-indigo-600 transition";
                                img.onclick = async () => {
                                    currentSlides[currentSlideIndex].imageUrl = imgUrl;
                                    currentSlides[currentSlideIndex].imageKeyword = kw;
                                    await rerenderCurrentSlide();
                                    alert('🖼️ 사진이 성공적으로 교체되었습니다.');
                                };
                                grid.appendChild(img);
                            });
                        } else {
                            grid.innerHTML = '<div class="text-[11px] text-red-400 col-span-5">검색 결과가 없습니다.</div>';
                        }
                    } catch (e) {
                        grid.innerHTML = '<div class="text-[11px] text-red-400 col-span-5">검색 실패</div>';
                    }
                }

                async function searchImagesManual() {
                    const kw = document.getElementById('manualImageKeyword').value;
                    if (!kw) return alert('검색어를 입력해주세요.');
                    const res = await fetch(\`/api/search-images?keyword=\${encodeURIComponent(kw)}\`);
                    const data = await res.json();
                    if (data.success && data.images.length > 0) {
                        currentImageUrl = data.images[0];
                        document.getElementById('mockImage').src = currentImageUrl;
                        renderCandidateThumbnails(data.images);
                    }
                }

                async function handleGenerate(isRefine) {
                    const btn = document.getElementById('genBtn');
                    const customTopic = document.getElementById('customTopic').value;
                    const finalTopic = customTopic || selectedTopic || \`\${currentCategory} 추천\`;
                    const instruction = document.getElementById('instruction').value;
                    const tone = document.getElementById('selectedTone').value;

                    btn.disabled = true;
                    btn.innerText = "⏳ 딥 리서치 분석 중...";

                    try {
                        const res = await fetch('/api/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                topic: finalTopic, 
                                category: currentCategory, 
                                instruction, 
                                tone 
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            currentPostId = null;
                            currentSlides = [];
                            generatedImageUrls = [];
                            currentBodyText = data.bodyText || '';
                            document.getElementById('slideEditorSection').style.display = 'none';
                            document.getElementById('slideIndicator').style.display = 'none';
                            document.getElementById('prevSlideBtn').style.display = 'none';
                            document.getElementById('nextSlideBtn').style.display = 'none';
                            document.getElementById('zipDownloadBtn').style.display = 'none';

                            document.getElementById('captionEditor').value = data.caption;
                            document.getElementById('mockImage').src = data.imageUrl;
                            currentImageUrl = data.imageUrl;
                            syncCaption();
                            renderHashtags(data.hashtags);
                            renderCandidateThumbnails(data.candidateImages);
                            loadPostList();
                        }
                    } catch (err) {
                        alert("생성 실패: " + err.message);
                    } finally {
                        btn.disabled = false;
                        btn.innerText = "✨ 단일 이미지 생성";
                    }
                }

                async function handleGenerateCarousel() {
                    const customTopic = document.getElementById('customTopic').value;
                    const finalTopic = customTopic || selectedTopic || \`\${currentCategory} 완벽 정리\`;
                    const instruction = document.getElementById('instruction').value;
                    const tone = document.getElementById('selectedTone').value;
                    const btn = document.getElementById('genCarouselBtn');

                    btn.disabled = true;
                    btn.innerText = '⏳ 딥 리서치 & 렌더링 중...';

                    try {
                        const response = await fetch('/api/generate-carousel', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                topic: finalTopic, 
                                layout: selectedLayout, 
                                category: currentCategory,
                                instruction,
                                tone
                            })
                        });

                        const data = await response.json();
                        if (data.success) {
                            currentPostId = data.id;
                            currentBodyText = data.bodyText || '';
                            generatedImageUrls = data.imageUrls || [];
                            currentSlides = data.slides || [];
                            
                            document.getElementById('captionEditor').value = data.caption || '';
                            syncCaption();
                            renderHashtags(data.hashtags);
                            updateSlideViewer(0);
                            loadPostList();
                        } else {
                            alert('생성 실패: ' + (data.message || '오류'));
                        }
                    } catch (err) {
                        alert('서버 통신 오류');
                    } finally {
                        btn.disabled = false;
                        btn.innerText = '🎨 카드뉴스 생성';
                    }
                }

                async function saveCurrentDraft() {
                    const caption = document.getElementById('captionEditor').value;
                    if (!caption) return alert('저장할 내용이 없습니다.');
                    
                    const res = await fetch('/api/posts/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            id: currentPostId,
                            category: currentCategory,
                            topic: selectedTopic || document.getElementById('customTopic').value || '수동 작성글', 
                            caption, 
                            bodyText: currentBodyText,
                            hashtags: currentHashtags,
                            imageUrl: currentImageUrl || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80', 
                            candidateImages: currentCandidateImages,
                            imageUrls: generatedImageUrls,
                            layout: selectedLayout,
                            slides: currentSlides,
                            status: 'DRAFT',
                            scheduledAt: null
                        })
                    });
                    const data = await res.json();
                    if (data.success && data.post) currentPostId = data.post.id;
                    alert('성공적으로 임시저장되었습니다.');
                    loadPostList();
                }

                async function scheduleCurrentPost() {
                    const caption = document.getElementById('captionEditor').value;
                    const scheduleVal = document.getElementById('scheduleInput').value;
                    if (!caption) return alert('예약할 콘텐츠 내용이 없습니다.');
                    if (!scheduleVal) return alert('예약 일시를 선택해주세요.');

                    const scheduledAt = new Date(scheduleVal).toISOString();

                    const res = await fetch('/api/posts/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            id: currentPostId,
                            category: currentCategory,
                            topic: selectedTopic || document.getElementById('customTopic').value || '예약 콘텐츠', 
                            caption, 
                            bodyText: currentBodyText,
                            hashtags: currentHashtags,
                            imageUrl: currentImageUrl || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80', 
                            imageUrls: generatedImageUrls,
                            layout: selectedLayout,
                            slides: currentSlides,
                            status: 'SCHEDULED',
                            scheduledAt: scheduledAt
                        })
                    });
                    const data = await res.json();
                    if (data.success && data.post) currentPostId = data.post.id;

                    alert('⏰ [' + new Date(scheduleVal).toLocaleString('ko-KR') + '] 발행 예약이 등록되었습니다!');
                    loadPostList();
                }

                async function cancelSchedule(id) {
                    await fetch('/api/posts/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: 'DRAFT' })
                    });
                    loadPostList();
                }

                function setFilter(filter) {
                    currentFilter = filter;
                    document.querySelectorAll('#postFilterTabs button').forEach(btn => {
                        const active = btn.dataset.filter === filter;
                        btn.className = active
                            ? 'px-2 py-0.5 rounded-md font-bold bg-white text-slate-800 shadow-sm'
                            : 'px-2 py-0.5 rounded-md text-slate-500 hover:text-slate-800';
                    });
                    renderFilteredPosts();
                }

                function renderFilteredPosts() {
                    const storageList = document.getElementById('postStorageList');
                    let filtered = allPostsCache;
                    if (currentFilter !== 'ALL') {
                        filtered = allPostsCache.filter(p => p.status === currentFilter);
                    }

                    if (filtered.length === 0) {
                        storageList.innerHTML = '<div class="text-xs text-slate-400 p-2">해당 상태의 콘텐츠가 없습니다.</div>';
                        return;
                    }

                    storageList.innerHTML = '';
                    filtered.forEach(p => {
                        const isScheduled = p.status === 'SCHEDULED';
                        const isPublished = p.status === 'PUBLISHED';
                        const isFailed = p.status === 'FAILED';

                        let statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">DRAFT</span>';
                        if (isScheduled) statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">⏰ 예약대기</span>';
                        if (isPublished) statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ 발행완료</span>';
                        if (isFailed) statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">❌ 실패</span>';

                        const timeDisplay = isScheduled 
                            ? \`<span class="text-amber-700 font-semibold">\${new Date(p.scheduledAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 발행예정</span>\`
                            : (isPublished ? \`<a href="\${p.instagramPostUrl || '#'}" target="_blank" class="text-emerald-700 hover:underline font-semibold">\${new Date(p.publishedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 인스타링크 🔗</a>\` : new Date(p.updatedAt || p.createdAt).toLocaleDateString('ko-KR'));

                        const item = document.createElement('div');
                        item.className = "flex items-center justify-between p-3 border border-slate-200 rounded-xl text-xs " + (isScheduled ? "bg-amber-50/50 border-amber-200" : "bg-slate-50");
                        item.innerHTML = \`
                            <div class="flex items-center space-x-3 overflow-hidden">
                                <img src="\${p.imageUrl}" class="w-10 h-10 object-cover rounded-lg shrink-0">
                                <div class="truncate">
                                    <div class="flex items-center gap-1.5">
                                        <span class="font-bold text-slate-800 truncate">\${p.topic}</span>
                                        \${statusBadge}
                                    </div>
                                    <div class="text-[11px] text-slate-400 mt-0.5">[\${p.category || '일반'}] \${timeDisplay}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                <button onclick="loadPostData('\${p.id}')" class="px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">편집</button>
                                \${isScheduled ? \`<button onclick="cancelSchedule('\${p.id}')" class="px-2 py-1 bg-amber-200 text-amber-900 rounded-lg hover:bg-amber-300">취소</button>\` : ''}
                                <button onclick="deletePost('\${p.id}')" class="px-2 py-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-red-100 hover:text-red-600">삭제</button>
                            </div>
                        \`;
                        storageList.appendChild(item);
                    });
                }

                function exportDataJson() {
                    window.location.href = '/api/posts/export';
                }

                async function importDataJson(e) {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async function(evt) {
                        try {
                            const posts = JSON.parse(evt.target.result);
                            const res = await fetch('/api/posts/import', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ posts })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert(\`🎉 \${data.count}건의 콘텐츠가 성공적으로 복원되었습니다!\`);
                                loadPostList();
                            } else {
                                alert(\`❌ 복원 실패: \${data.message}\`);
                            }
                        } catch (err) {
                            alert('올바른 JSON 파일이 아닙니다.');
                        }
                    };
                    reader.readAsText(file);
                }

                async function loadPostList() {
                    try {
                        const res = await fetch('/api/posts');
                        const data = await res.json();
                        if (data.success) {
                            allPostsCache = data.posts || [];
                            const scheduledCount = allPostsCache.filter(p => p.status === 'SCHEDULED').length;
                            document.getElementById('queueBadge').innerText = \`대기 \${scheduledCount}건\`;
                            renderFilteredPosts();
                        }
                    } catch (e) {
                        document.getElementById('postStorageList').innerHTML = '<div class="text-xs text-red-400">보관함 로드 실패</div>';
                    }
                }

                async function loadPostData(id) {
                    const post = allPostsCache.find(p => p.id === id);
                    if (post) {
                        currentPostId = post.id;
                        currentCategory = post.category || '가족여행';
                        currentBodyText = post.bodyText || '';
                        document.getElementById('captionEditor').value = post.caption;
                        currentImageUrl = post.imageUrl;
                        selectedLayout = post.layout || 'modern';
                        
                        document.querySelectorAll('.cat-chip').forEach(btn => {
                            if (btn.innerText.includes(currentCategory)) {
                                btn.className = "cat-chip px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm transition";
                            } else {
                                btn.className = "cat-chip px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold rounded-xl transition";
                            }
                        });

                        document.querySelectorAll('.layout-btn').forEach(btn => {
                            const active = btn.dataset.layout === selectedLayout;
                            btn.className = active
                                ? 'layout-btn p-2 rounded-lg border-2 border-indigo-500 bg-indigo-50 text-indigo-700 text-xs font-bold transition'
                                : 'layout-btn p-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold transition';
                        });

                        generatedImageUrls = post.imageUrls || [];
                        currentSlides = post.slides || [];
                        currentCandidateImages = post.candidateImages || [];

                        syncCaption();
                        if (post.hashtags) renderHashtags(post.hashtags);

                        if (post.scheduledAt) {
                            const date = new Date(post.scheduledAt);
                            const localISO = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                            document.getElementById('scheduleInput').value = localISO;
                        }

                        if (generatedImageUrls.length > 0) {
                            updateSlideViewer(0);
                        } else {
                            document.getElementById('mockImage').src = post.imageUrl;
                            document.getElementById('slideIndicator').style.display = 'none';
                            document.getElementById('prevSlideBtn').style.display = 'none';
                            document.getElementById('nextSlideBtn').style.display = 'none';
                            document.getElementById('zipDownloadBtn').style.display = 'none';
                            document.getElementById('slideEditorSection').style.display = 'none';
                            if (currentCandidateImages.length > 0) {
                                renderCandidateThumbnails(currentCandidateImages);
                            }
                        }
                    }
                }

                async function deletePost(id) {
                    if (!confirm('정말 삭제하시겠습니까?')) return;
                    await fetch(\`/api/posts/\${id}\`, { method: 'DELETE' });
                    if (currentPostId === id) currentPostId = null;
                    loadPostList();
                }

                function downloadCurrentImage() {
                    if (!currentImageUrl) return;
                    const a = document.createElement('a');
                    a.href = currentImageUrl;
                    a.download = \`cardnews_\${Date.now()}.png\`;
                    a.click();
                }

                async function downloadAllZip() {
                    if (!generatedImageUrls || generatedImageUrls.length === 0) return;
                    const zip = new JSZip();
                    const folder = zip.folder("cardnews");

                    for (let i = 0; i < generatedImageUrls.length; i++) {
                        const url = generatedImageUrls[i];
                        const blob = await fetch(url).then(r => r.blob());
                        const slideName = i === 0 ? '01_cover.png' : (i === generatedImageUrls.length - 1 ? \`0\${i+1}_outro.png\` : \`0\${i+1}_slide.png\`);
                        folder.file(slideName, blob);
                    }

                    const zipBlob = await zip.generateAsync({ type: "blob" });
                    saveAs(zipBlob, \`cardnews_\${Date.now()}.zip\`);
                }

                async function publishDirectToInstagram() {
                    const caption = document.getElementById('captionEditor').value;
                    if (!caption) return alert('게시할 캡션 내용이 없습니다.');
                    if (!confirm('실제 연결된 인스타그램 계정에 지금 바로 게시하시겠습니까?')) return;

                    const btn = document.getElementById('publishNowBtn');
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 인스타그램 업로드 중...';

                    try {
                        const res = await fetch('/api/publish-now', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                postId: currentPostId,
                                imageUrls: generatedImageUrls,
                                imageUrl: currentImageUrl,
                                caption: caption
                            })
                        });

                        const data = await res.json();
                        if (data.success) {
                            alert(\`🎉 인스타그램 피드 게시 성공!\n링크: \${data.postUrl}\`);
                            loadPostList();
                        } else {
                            alert(\`❌ 게시 실패: \${data.message}\`);
                        }
                    } catch (err) {
                        alert('서버 통신 중 오류가 발생했습니다.');
                    } finally {
                        btn.disabled = false;
                        btn.innerHTML = '🚀 인스타그램에 실제 바로 게시';
                    }
                }

                async function toggleAutoPilot() {
                    const interval = document.getElementById('autoInterval').value;
                    const autoSchedule = document.getElementById('autoScheduleCheck').checked;
                    isAutoEnabled = !isAutoEnabled;
                    const res = await fetch('/api/autopilot/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: isAutoEnabled, interval, autoSchedule })
                    });
                    const data = await res.json();
                    updateAutoUI(data.state);
                }

                function updateAutoUI(state) {
                    const btn = document.getElementById('autoToggleBtn');
                    if (state.enabled) {
                        btn.className = "px-5 py-2.5 rounded-lg font-bold text-sm bg-emerald-500 text-white shadow-md animate-pulse";
                        btn.innerText = "자동화 ON 🟢";
                    } else {
                        btn.className = "px-5 py-2.5 rounded-lg font-bold text-sm bg-slate-300 text-slate-700 transition";
                        btn.innerText = "자동화 OFF 🔴";
                    }
                    const logConsole = document.getElementById('logConsole');
                    logConsole.innerHTML = state.logs.map(l => \`<div>> \${l}</div>\`).join('');
                }

                setInterval(async () => {
                    const res = await fetch('/api/autopilot');
                    const data = await res.json();
                    updateAutoUI(data);
                }, 3000);

                fetchTrends();
                loadPostList();
            </script>
        </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`✅ [인스타그램 스튜디오 완벽 파이프라인] 서버 가동 (포트: ${port})`);
});