/**
 * Pexels Client Configuration
 *
 * Pexels API 클라이언트 초기화 및 설정
 * 이미지/비디오 검색을 위한 Pexels API 래퍼
 */

import { createClient } from 'pexels';

// 환경 변수에서 Pexels API 키 가져오기
const pexelsApiKey = import.meta.env.VITE_PEXELS_API_KEY || '';

// Pexels 연결 가능 여부 확인
export const isPexelsConfigured = !!pexelsApiKey;

// Pexels 클라이언트 생성 (설정이 있는 경우만)
export const pexels = isPexelsConfigured ? createClient(pexelsApiKey) : null;

/**
 * 사진 검색
 * @param {string} query - 검색어
 * @param {Object} options - 검색 옵션
 * @param {number} options.perPage - 페이지당 결과 수 (기본값: 10)
 * @param {number} options.page - 페이지 번호 (기본값: 1)
 * @returns {Promise<Object|null>} 검색 결과
 */
export const searchPhotos = async (query, options = {}) => {
  if (!isPexelsConfigured || !pexels) {
    console.warn('Pexels API is not configured');
    return null;
  }

  try {
    const result = await pexels.photos.search({
      query,
      per_page: options.perPage || 10,
      page: options.page || 1,
      ...options
    });
    return result;
  } catch (error) {
    console.error('Pexels photo search failed:', error);
    return null;
  }
};

/**
 * 큐레이션된 사진 가져오기
 * @param {Object} options - 옵션
 * @param {number} options.perPage - 페이지당 결과 수 (기본값: 10)
 * @param {number} options.page - 페이지 번호 (기본값: 1)
 * @returns {Promise<Object|null>} 결과
 */
export const getCuratedPhotos = async (options = {}) => {
  if (!isPexelsConfigured || !pexels) {
    console.warn('Pexels API is not configured');
    return null;
  }

  try {
    const result = await pexels.photos.curated({
      per_page: options.perPage || 10,
      page: options.page || 1
    });
    return result;
  } catch (error) {
    console.error('Pexels curated photos failed:', error);
    return null;
  }
};

/**
 * 특정 사진 가져오기
 * @param {number} id - 사진 ID
 * @returns {Promise<Object|null>} 사진 데이터
 */
export const getPhoto = async (id) => {
  if (!isPexelsConfigured || !pexels) {
    console.warn('Pexels API is not configured');
    return null;
  }

  try {
    const result = await pexels.photos.show({ id });
    return result;
  } catch (error) {
    console.error('Pexels get photo failed:', error);
    return null;
  }
};

/**
 * 비디오 검색
 * @param {string} query - 검색어
 * @param {Object} options - 검색 옵션
 * @returns {Promise<Object|null>} 검색 결과
 */
export const searchVideos = async (query, options = {}) => {
  if (!isPexelsConfigured || !pexels) {
    console.warn('Pexels API is not configured');
    return null;
  }

  try {
    const result = await pexels.videos.search({
      query,
      per_page: options.perPage || 10,
      page: options.page || 1,
      ...options
    });
    return result;
  } catch (error) {
    console.error('Pexels video search failed:', error);
    return null;
  }
};

/**
 * 인기 비디오 가져오기
 * @param {Object} options - 옵션
 * @returns {Promise<Object|null>} 결과
 */
export const getPopularVideos = async (options = {}) => {
  if (!isPexelsConfigured || !pexels) {
    console.warn('Pexels API is not configured');
    return null;
  }

  try {
    const result = await pexels.videos.popular({
      per_page: options.perPage || 10,
      page: options.page || 1
    });
    return result;
  } catch (error) {
    console.error('Pexels popular videos failed:', error);
    return null;
  }
};

export default pexels;
