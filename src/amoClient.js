import axios from 'axios';
import * as tokenStore from './tokenStore.js';
import { FIELD_MAPPING, getEnumId } from './fieldMapping.js';

const AMO_DOMAIN = process.env.AMO_DOMAIN || 'https://skamoauraroboticsru.amocrm.ru';

// Кэш для ID полей (чтобы не запрашивать каждый раз)
let fieldIdsCache = null;

/**
 * Централизованный запрос к amoCRM API
 */
export async function amoRequest(method, endpoint, data = null) {
  const accessToken = tokenStore.getAccessToken();
  
  if (!accessToken) {
    throw new Error('Access token не установлен. Необходима авторизация.');
  }

  try {
    const fullUrl = `${AMO_DOMAIN}${endpoint}`;
    const config = {
      method,
      url: fullUrl,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    // Если получили 401 - токен истек
    if (error.response?.status === 401) {
      console.warn('[amoClient] Токен доступа истек или недействителен');
      throw new Error('Токен доступа истек. Обновите AMO_ACCESS_TOKEN вручную через OAuth авторизацию amoCRM');
    }

    // Обрабатываем остальные ошибки
    const errorMessage = error.response?.data?.detail || error.response?.data?.title || error.message;
    throw new Error(`amoCRM API ошибка: ${errorMessage}`);
  }
}

/**
 * Найти контакт по телефону
 */
export async function findContactByPhone(phone) {
  try {
    const normalizedPhone = phone.replace(/\D/g, '');
    const response = await amoRequest('GET', `/api/v4/contacts?query=${encodeURIComponent(normalizedPhone)}`);
    
    if (!response._embedded?.contacts?.length) {
      return null;
    }

    // Ищем точное совпадение телефона
    for (const contact of response._embedded.contacts) {
      if (!contact.custom_fields_values) continue;
      
      for (const field of contact.custom_fields_values) {
        if (!field.values) continue;
        
        for (const value of field.values) {
          const contactPhone = String(value.value || '').replace(/\D/g, '');
          if (contactPhone === normalizedPhone) {
            return contact;
          }
        }
      }
    }
    
    // Если точного совпадения нет, возвращаем первый найденный
    return response._embedded.contacts[0];
  } catch (error) {
    console.error('[amoClient] Ошибка поиска контакта:', error.message);
    throw error;
  }
}

/**
 * Получить ID полей (с кэшированием)
 */
async function getFieldIds() {
  // Используем кэш, если доступен
  if (fieldIdsCache) {
    return fieldIdsCache;
  }

  let phoneFieldId = FIELD_MAPPING.contact.phone.fieldId;
  let emailFieldId = FIELD_MAPPING.contact.email.fieldId;
  let positionFieldId = FIELD_MAPPING.contact.position.fieldId;

  // Если ID не заданы, пытаемся получить их из API
  if (!phoneFieldId || !emailFieldId || !positionFieldId) {
    try {
      const response = await amoRequest('GET', '/api/v4/contacts/custom_fields');
      const fields = response?._embedded?.custom_fields || (Array.isArray(response) ? response : []);
      
      if (fields && Array.isArray(fields)) {
        for (const field of fields) {
          // Ищем поля по code из конфигурации
          if (!phoneFieldId && field.code === FIELD_MAPPING.contact.phone.code) {
            phoneFieldId = field.id;
          }
          if (!emailFieldId && field.code === FIELD_MAPPING.contact.email.code) {
            emailFieldId = field.id;
          }
          if (!positionFieldId && field.code === FIELD_MAPPING.contact.position.code) {
            positionFieldId = field.id;
          }
        }
      }
      
      if (!phoneFieldId || !emailFieldId || !positionFieldId) {
        console.warn('[amoClient] Не все поля найдены автоматически. Укажите ID полей в .env или fieldMapping.js');
      }
    } catch (error) {
      console.error('[amoClient] Ошибка получения списка полей:', error.message);
    }
  }

  // Сохраняем в кэш
  fieldIdsCache = { phoneFieldId, emailFieldId, positionFieldId };
  return fieldIdsCache;
}

/**
 * Формирование данных кастомных полей контакта
 */
function buildContactCustomFields(phone, email, position, phoneFieldId, emailFieldId, positionFieldId) {
  const customFields = [];

  if (phoneFieldId) {
    const enumId = getEnumId('phone', FIELD_MAPPING.contact.phone.defaultEnum);
    customFields.push({
      field_id: phoneFieldId,
      values: [{ value: phone, ...(enumId && { enum_id: enumId }) }],
    });
  }

  if (email && emailFieldId) {
    const enumId = getEnumId('email', FIELD_MAPPING.contact.email.defaultEnum);
    customFields.push({
      field_id: emailFieldId,
      values: [{ value: email, ...(enumId && { enum_id: enumId }) }],
    });
  }

  if (position && positionFieldId) {
    customFields.push({
      field_id: positionFieldId,
      values: [{ value: position }],
    });
  }

  return customFields;
}

/**
 * Создать контакт
 */
export async function createContact(name, phone, email = null, company = null, position = null) {
  const { phoneFieldId, emailFieldId, positionFieldId } = await getFieldIds();

  const contactData = [{
    name: name || phone,
  }];

  const customFields = buildContactCustomFields(phone, email, position, phoneFieldId, emailFieldId, positionFieldId);
  if (customFields.length > 0) {
    contactData[0].custom_fields_values = customFields;
  }

  // Добавляем компанию
  if (company) {
    contactData[0].company_name = company;
    // Также привязываем компанию через _embedded для надежности
    const companyObj = await findOrCreateCompany(company);
    if (companyObj) {
      contactData[0]._embedded = {
        companies: [{ id: companyObj.id }],
      };
    }
  }

  try {
    const response = await amoRequest('POST', '/api/v4/contacts', contactData);
    
    if (response._embedded?.contacts?.[0]) {
      return response._embedded.contacts[0];
    }
    
    throw new Error('Контакт не был создан');
  } catch (error) {
    console.error('[amoClient] Ошибка создания контакта:', error.message);
    throw error;
  }
}

/**
 * Обновить контакт
 */
export async function updateContact(contactId, name, phone, email = null, company = null, position = null) {
  const { phoneFieldId, emailFieldId, positionFieldId } = await getFieldIds();

  // Получаем текущий контакт для сохранения существующих полей
  let existingContact;
  try {
    const response = await amoRequest('GET', `/api/v4/contacts/${contactId}`);
    existingContact = response?._embedded?.contacts?.[0] || response;
  } catch (error) {
    console.warn('[amoClient] Не удалось получить текущий контакт');
  }

  const contactData = [{
    id: contactId,
    name: name || phone,
  }];

  // Сохраняем существующие поля (кроме обновляемых)
  const customFieldsMap = new Map();
  const fieldsToUpdate = [phoneFieldId, emailFieldId, positionFieldId].filter(Boolean);
  
  if (existingContact?.custom_fields_values) {
    for (const field of existingContact.custom_fields_values) {
      if (!fieldsToUpdate.includes(field.field_id)) {
        customFieldsMap.set(field.field_id, field);
      }
    }
  }

  // Добавляем/обновляем поля
  const newFields = buildContactCustomFields(phone, email, position, phoneFieldId, emailFieldId, positionFieldId);
  for (const field of newFields) {
    customFieldsMap.set(field.field_id, field);
  }

  if (customFieldsMap.size > 0) {
    contactData[0].custom_fields_values = Array.from(customFieldsMap.values());
  }

  // Компания - всегда устанавливаем, если передана, иначе сохраняем существующую
  if (company) {
    contactData[0].company_name = company;
    // Также привязываем компанию через _embedded для надежности
    const companyObj = await findOrCreateCompany(company);
    if (companyObj) {
      if (!contactData[0]._embedded) {
        contactData[0]._embedded = {};
      }
      contactData[0]._embedded.companies = [{ id: companyObj.id }];
    }
  } else if (existingContact?.company_name) {
    // Сохраняем существующую компанию, если новая не указана
    contactData[0].company_name = existingContact.company_name;
  }

  try {
    const response = await amoRequest('PATCH', `/api/v4/contacts/${contactId}`, contactData);
    
    if (response._embedded?.contacts?.[0]) {
      return response._embedded.contacts[0];
    }
    
    // Если ответ не содержит _embedded, получаем контакт заново
    if (response && !response._embedded) {
      const updated = await amoRequest('GET', `/api/v4/contacts/${contactId}`);
      return updated?._embedded?.contacts?.[0] || updated;
    }
    
    throw new Error('Контакт не был обновлен');
  } catch (error) {
    console.error('[amoClient] Ошибка обновления контакта:', error.message);
    throw error;
  }
}

/**
 * Найти или создать компанию
 */
async function findOrCreateCompany(companyName) {
  if (!companyName) return null;

  try {
    // Ищем компанию по названию
    const response = await amoRequest('GET', `/api/v4/companies?query=${encodeURIComponent(companyName)}`);
    
    if (response._embedded?.companies?.length > 0) {
      // Проверяем точное совпадение названия
      for (const company of response._embedded.companies) {
        if (company.name === companyName) {
          return company;
        }
      }
      // Если точного совпадения нет, возвращаем первую найденную
      return response._embedded.companies[0];
    }

    // Компания не найдена, создаем новую
    const companyData = [{
      name: companyName,
    }];

    const createResponse = await amoRequest('POST', '/api/v4/companies', companyData);
    
    if (createResponse._embedded?.companies?.[0]) {
      return createResponse._embedded.companies[0];
    }

    return null;
  } catch (error) {
    console.error('[amoClient] Ошибка работы с компанией:', error.message);
    return null;
  }
}

/**
 * Создать сделку
 */
export async function createLead(contactId, name, budget = null, tags = [], companyName = null) {
  const leadData = [{
    name: name,
    price: budget || 0,
    pipeline_id: FIELD_MAPPING.lead.pipelineId,
    status_id: FIELD_MAPPING.lead.statusId,
    _embedded: {
      contacts: [{ id: contactId }],
    },
  }];

  // Добавляем компанию, если указана
  if (companyName) {
    const company = await findOrCreateCompany(companyName);
    if (company) {
      leadData[0]._embedded.companies = [{ id: company.id }];
    }
  }

  if (tags?.length > 0) {
    leadData[0]._embedded.tags = tags.map(tag => ({ name: tag }));
  }

  try {
    const response = await amoRequest('POST', '/api/v4/leads', leadData);
    
    if (response._embedded?.leads?.[0]) {
      return response._embedded.leads[0];
    }
    
    throw new Error('Сделка не была создана');
  } catch (error) {
    console.error('[amoClient] Ошибка создания сделки:', error.message);
    throw error;
  }
}

/**
 * Добавить примечание к сделке
 */
export async function addNoteToLead(leadId, noteText) {
  const noteData = [
    {
      entity_id: leadId,
      note_type: 'common',
      text: noteText,
    },
  ];

  try {
    // В amoCRM API v4 примечания к сделкам создаются через endpoint /api/v4/leads/{lead_id}/notes
    await amoRequest('POST', `/api/v4/leads/${leadId}/notes`, noteData);
  } catch (error) {
    console.error('[amoClient] Ошибка добавления примечания:', error.message);
    throw error;
  }
}
