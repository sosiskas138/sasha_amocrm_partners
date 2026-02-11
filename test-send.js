import axios from 'axios';
import fs from 'fs';

const testData = JSON.parse(fs.readFileSync('./test-webhook.json', 'utf8'));

console.log('Отправляю тестовый запрос на http://localhost:3000/webhook...');
console.log('Данные:', JSON.stringify(testData, null, 2));

try {
  const response = await axios.post('http://localhost:3000/webhook', testData, {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  console.log('\n✅ Успешно! Ответ сервера:');
  console.log(JSON.stringify(response.data, null, 2));
  console.log('\nСтатус:', response.status);
} catch (error) {
  console.error('\n❌ Ошибка:');
  if (error.response) {
    console.error('Статус:', error.response.status);
    console.error('Данные:', JSON.stringify(error.response.data, null, 2));
  } else if (error.request) {
    console.error('Не удалось подключиться к серверу. Убедитесь, что сервер запущен на порту 3000');
    console.error('Запустите: npm start');
  } else {
    console.error('Ошибка:', error.message);
  }
  process.exit(1);
}
