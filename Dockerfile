FROM node:20-alpine

# Устанавливаем curl для healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --omit=dev

# Копируем исходный код
COPY src/ ./src/

# Открываем порт (будет переопределен через переменные окружения)
EXPOSE 3000

# Запускаем приложение
CMD ["node", "src/app.js"]
