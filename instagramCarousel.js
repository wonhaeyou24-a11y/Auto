const axios = require('axios');

/**
 * 1. 단일 이미지 인스타그램 피드 발행
 */
async function publishInstagramSingle(imageUrl, caption, igUserId, accessToken) {
  try {
    // 1. 단일 미디어 컨테이너 생성
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      null,
      {
        params: {
          image_url: imageUrl,
          caption: caption,
          access_token: accessToken,
        },
      }
    );

    const creationId = containerRes.data.id;

    // 2. 최종 피드 게시
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: accessToken,
        },
      }
    );

    const postId = publishRes.data.id;
    return {
      success: true,
      postId: postId,
      postUrl: `https://www.instagram.com/p/${postId}/`
    };
  } catch (err) {
    console.error('인스타그램 단일 이미지 업로드 에러:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

/**
 * 2. 캐러셀(카드뉴스 여러 장) 인스타그램 피드 발행
 */
async function publishInstagramCarousel(imageUrls, caption, igUserId, accessToken) {
  try {
    const childContainerIds = [];

    // 1. 각 슬라이드별 자식 미디어 컨테이너 생성
    for (const url of imageUrls) {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        null,
        {
          params: {
            image_url: url,
            is_carousel_item: true,
            access_token: accessToken,
          },
        }
      );
      childContainerIds.push(res.data.id);
    }

    // 2. 전체를 묶는 캐러셀 컨테이너 생성
    const carouselRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      null,
      {
        params: {
          media_type: 'CAROUSEL',
          children: childContainerIds.join(','),
          caption: caption,
          access_token: accessToken,
        },
      }
    );

    const creationId = carouselRes.data.id;

    // 3. 최종 인스타그램 게시
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: accessToken,
        },
      }
    );

    const postId = publishRes.data.id;
    return {
      success: true,
      postId: postId,
      postUrl: `https://www.instagram.com/p/${postId}/`
    };
  } catch (err) {
    console.error('인스타그램 캐러셀 업로드 에러:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

module.exports = {
  publishInstagramSingle,
  publishInstagramCarousel
};