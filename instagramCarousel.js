const axios = require('axios');

async function fetchInstagramPermalink(postId, accessToken) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
      params: {
        fields: 'permalink',
        access_token: accessToken,
      },
      timeout: 5000,
    });
    return res.data.permalink || `https://www.instagram.com/p/${postId}/`;
  } catch (e) {
    return `https://www.instagram.com/p/${postId}/`;
  }
}

async function publishInstagramSingle(imageUrl, caption, igUserId, accessToken) {
  try {
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
    const postUrl = await fetchInstagramPermalink(postId, accessToken);

    return {
      success: true,
      postId: postId,
      postUrl: postUrl
    };
  } catch (err) {
    console.error('인스타그램 단일 업로드 에러:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

async function publishInstagramCarousel(imageUrls, caption, igUserId, accessToken) {
  try {
    const childContainerIds = [];

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
    const postUrl = await fetchInstagramPermalink(postId, accessToken);

    return {
      success: true,
      postId: postId,
      postUrl: postUrl
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