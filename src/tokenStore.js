/**
 * Хранилище OAuth токена для amoCRM
 * В production рекомендуется использовать Redis или БД
 */

let accessToken = null;

/**
 * Установить токен
 */
export function setToken(token) {
  accessToken = token;
}

/**
 * Получить access token
 */
export function getAccessToken() {
  return accessToken;
}

/**
 * Проверить, установлен ли токен
 */
export function hasToken() {
  return !!accessToken;
}
