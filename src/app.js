import express from 'express';
import dotenv from 'dotenv';
import * as tokenStore from './tokenStore.js';
import * as webhookHandler from './webhookHandler.js';

// Загружаем переменные окружения
dotenv.config();

const app = express();
// Используем INTERNAL_PORT для работы внутри контейнера, или PORT как fallback
const PORT = process.env.INTERNAL_PORT || process.env.PORT || 3000;

// Middleware для парсинга JSON
app.use(express.json());

// Логирование запросов (только для webhook)
app.use((req, res, next) => {
  if (req.path === '/webhook') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('[app] Входящий запрос:', JSON.stringify(req.body, null, 2));
  }
  next();
});

/**
 * POST /webhook - обработка входящих webhook
 */
app.post('/webhook', async (req, res) => {
  try {
    // Логируем входящий запрос
    console.log('\n========== ВХОДЯЩИЙ ЗАПРОС ==========');
    console.log(`[${new Date().toISOString()}] POST /webhook`);
    console.log('Тело запроса:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('=====================================\n');

    // Проверяем наличие токена
    if (!tokenStore.hasToken()) {
      console.error('[app] Токен не установлен');
      return res.status(500).json({
        error: 'Токен авторизации не установлен. Необходимо настроить AMO_ACCESS_TOKEN',
      });
    }

    // Обрабатываем webhook
    const result = await webhookHandler.handleWebhook(req.body);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[app] Ошибка обработки webhook:', error.message);
    
    // Если ошибка валидации (нет телефона) - возвращаем 400
    if (error.message.includes('Телефон обязателен')) {
      return res.status(400).json({
        error: error.message,
      });
    }

    // Остальные ошибки - 500
    return res.status(500).json({
      error: error.message || 'Внутренняя ошибка сервера',
    });
  }
});

/**
 * GET /health - проверка здоровья сервиса
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasToken: tokenStore.hasToken(),
  });
});

/**
 * Инициализация токена из переменных окружения
 */
function initializeToken() {
  const accessToken = process.env.AMO_ACCESS_TOKEN;

  if (accessToken) {
    tokenStore.setToken(accessToken);
    console.log('[app] Токен инициализирован из переменных окружения');
  } else {
    console.warn('[app] ВНИМАНИЕ: Токен не найден в переменных окружения');
    console.warn('[app] Установите AMO_ACCESS_TOKEN в .env файле');
  }
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`[app] Сервер запущен на порту ${PORT}`);
  console.log(`[app] Webhook endpoint: http://localhost:${PORT}/webhook`);
  
  initializeToken();
});

// Обработка ошибок процесса
process.on('unhandledRejection', (error) => {
  console.error('[app] Необработанное отклонение промиса:', error);
});

process.on('uncaughtException', (error) => {
  console.error('[app] Необработанное исключение:', error);
  process.exit(1);
});
