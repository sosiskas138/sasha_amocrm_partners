/**
 * Конфигурация маппинга полей amoCRM
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * 
 * 1. Автоматическое определение (рекомендуется):
 *    - Оставьте fieldId: null
 *    - Система автоматически найдет поля по code (PHONE, EMAIL, POSITION)
 * 
 * 2. Ручная настройка через переменные окружения (.env):
 *    - Укажите AMO_PHONE_FIELD_ID, AMO_EMAIL_FIELD_ID, AMO_POSITION_FIELD_ID
 *    - Или измените значения ниже напрямую
 * 
 * 3. Получение ID полей:
 *    - Выполните GET /api/v4/contacts/custom_fields
 *    - Найдите нужные поля и скопируйте их ID
 * 
 * 4. Получение enum_id:
 *    - В ответе GET /api/v4/contacts/custom_fields найдите поле
 *    - В массиве enums найдите нужный тип (WORK, MOB и т.д.)
 *    - Скопируйте id из enum объекта
 */

export const FIELD_MAPPING = {
  // Поля контакта
  contact: {
    // Телефон (multitext поле)
    phone: {
      fieldId: process.env.AMO_PHONE_FIELD_ID || null, // null = автоопределение по code
      code: 'PHONE', // Код поля для автоматического поиска
      enumId: {
        WORK: 1322665,    // Рабочий телефон
        MOB: 1322669,     // Мобильный телефон
        HOME: 1322673,    // Домашний телефон
        OTHER: 1322675,   // Другой
      },
      defaultEnum: 'WORK', // Тип по умолчанию при создании
    },
    
    // Email (multitext поле)
    email: {
      fieldId: process.env.AMO_EMAIL_FIELD_ID || null,
      code: 'EMAIL',
      enumId: {
        WORK: 1322677,    // Рабочий email
        PRIV: 1322679,    // Личный email
        OTHER: 1322681,   // Другой
      },
      defaultEnum: 'WORK',
    },
    
    // Должность (text поле)
    position: {
      fieldId: process.env.AMO_POSITION_FIELD_ID || null,
      code: 'POSITION',
    },
  },
  
  // Настройки сделок
  lead: {
    pipelineId: 10582926,  // ID воронки "от AI прозвонщика"
    statusId: 83463326,    // ID этапа "Первичный контакт"
  },
};

/**
 * Получить enum_id для поля
 */
export function getEnumId(fieldType, enumType) {
  const field = FIELD_MAPPING.contact[fieldType];
  if (!field || !field.enumId) return null;
  return field.enumId[enumType] || field.enumId[field.defaultEnum] || null;
}
