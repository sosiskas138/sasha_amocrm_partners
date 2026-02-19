import * as amoClient from './amoClient.js';

/**
 * Парсинг данных из webhook
 */
function parseWebhookData(body) {
  const phone = body.contact?.phone;
  
  if (!phone) {
    throw new Error('Телефон обязателен для создания контакта');
  }

  const name = 
    body.contact?.additionalFields?.name ||
    body.call?.agreements?.client_name ||
    null;

  // Получаем данные из leadTransfer
  const leadTransfer = body.call?.agreements?.leadTransfer;
  const email = leadTransfer?.email || null;
  const company = leadTransfer?.company || null;
  const position = leadTransfer?.position || null;

  let budget = null;
  const budgetStr = leadTransfer?.budget;
  if (budgetStr) {
    const budgetNum = Number(budgetStr);
    if (!isNaN(budgetNum) && isFinite(budgetNum)) {
      budget = budgetNum;
    }
  }

  const source = leadTransfer?.source || null;
  const priority = leadTransfer?.priority || null;

  const tags = 
    Array.isArray(body.contact?.tags) ? body.contact.tags : [];

  const recordUrl = 
    body.call?.recordUrl ||
    null;

  const agreements = body.call?.agreements?.agreements || null;
  const agreementsTimeLocal = body.call?.agreements?.agreements_time_local || null;
  
  // Дополнительные данные для примечания
  const callDuration = body.call?.duration || null;
  const callStartedAt = body.call?.startedAt || null;
  const clientFacts = body.call?.agreements?.client_facts || null;
  const chatHistory = body.call?.callDetails?.chatHistory || null;
  const contactRate = body.call?.agreements?.contact_rate || null;
  const cvalRate = body.call?.agreements?.cval_rate || null;
  const region = leadTransfer?.region || null;

  return {
    phone,
    name,
    email,
    company,
    position,
    budget,
    source,
    priority,
    tags,
    recordUrl,
    agreements,
    agreementsTimeLocal,
    callDuration,
    callStartedAt,
    clientFacts,
    chatHistory,
    contactRate,
    cvalRate,
    region,
  };
}

/**
 * Форматирование длительности звонка из миллисекунд в MM:SS
 */
function formatDuration(ms) {
  if (!ms) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Форматирование даты и времени
 */
function formatDateTime(dateTimeString, timezone = 'МСК') {
  if (!dateTimeString) return '—';
  try {
    let date;
    
    // Если строка в формате "YYYY-MM-DD HH:mm:ss" (локальное время МСК)
    if (typeof dateTimeString === 'string' && dateTimeString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      // Преобразуем в ISO формат, предполагая что это МСК время
      const [datePart, timePart] = dateTimeString.split(' ');
      date = new Date(`${datePart}T${timePart}+03:00`);
    } else {
      // Если это ISO строка (UTC), конвертируем в МСК
      date = new Date(dateTimeString);
      // МСК = UTC+3, добавляем 3 часа если это UTC время
      if (dateTimeString.includes('Z') || dateTimeString.includes('+00:00')) {
        date = new Date(date.getTime() + 3 * 60 * 60 * 1000);
      }
    }
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes} по ${timezone}`;
  } catch (e) {
    return dateTimeString;
  }
}

/**
 * Формирование текста примечания для сделки
 */
function formatNoteText(data) {
  const parts = [];

  // Компания в начале жирным
  if (data.company) {
    parts.push(`<b>Компания: ${data.company}</b>`);
    parts.push(''); // Пустая строка для разделения
  }

  // Основная информация
  parts.push(`Имя: ${data.name || '—'}`);
  parts.push(`Телефон: ${data.phone ? `+${data.phone}` : '—'}`);
  
  // Информация о звонке
  parts.push(`Длительность звонка: ${formatDuration(data.callDuration)}`);
  parts.push(`Время начала звонка: ${formatDateTime(data.callStartedAt)}`);
  
  // Заинтересованность (используем contact_rate или cval_rate)
  const interest = data.contactRate || data.cvalRate || null;
  parts.push(`Заинтересованность: ${interest ? `${interest}%` : '—'}`);
  
  // Запись звонка
  parts.push(`Запись звонка: ${data.recordUrl || '—'}`);
  
  // Договоренности
  parts.push('');
  parts.push(`Договоренности: ${data.agreements || '—'}`);
  parts.push(`Время договоренности: ${data.agreementsTimeLocal ? formatDateTime(data.agreementsTimeLocal) : '—'}`);
  
  // Регион
  if (data.region) {
    parts.push(`Возможный регион: ${data.region}`);
  }
  
  // Теги
  const tagsStr = data.tags && data.tags.length > 0 ? data.tags.join(', ') : '—';
  parts.push(`Теги: ${tagsStr}`);
  
  // О клиенте
  if (data.clientFacts) {
    parts.push('');
    parts.push('О клиенте:');
    parts.push(data.clientFacts);
  }
  
  // Диалог
  if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
    parts.push('');
    parts.push('Диалог:');
    for (const message of data.chatHistory) {
      const role = message.role === 'user' ? 'Клиент' : 'Ассистент';
      parts.push(`${role}: ${message.content || ''}`);
    }
  }

  return parts.join('\n');
}

/**
 * Обработка webhook
 */
export async function handleWebhook(body) {
  try {
    // Парсим данные из webhook
    const data = parseWebhookData(body);

    // Находим или создаем контакт
    let contact = await amoClient.findContactByPhone(data.phone);
    
    if (!contact) {
      contact = await amoClient.createContact(
        data.name || data.phone,
        data.phone,
        data.email,
        data.company,
        data.position
      );
    } else {
      // Обновляем контакт с новыми данными
      contact = await amoClient.updateContact(
        contact.id,
        data.name || data.phone,
        data.phone,
        data.email,
        data.company,
        data.position
      );
    }

    // Формируем название сделки
    const leadName = `${data.company || data.name || data.phone} / ${data.phone}`;

    // Создаем сделку
    const lead = await amoClient.createLead(
      contact.id,
      leadName,
      data.budget,
      data.tags,
      data.company
    );

    // Формируем и добавляем примечание
    const noteText = formatNoteText(data);
    if (noteText) {
      await amoClient.addNoteToLead(lead.id, noteText);
    }

    return {
      success: true,
      contactId: contact.id,
      leadId: lead.id,
    };
  } catch (error) {
    console.error('[webhookHandler] Ошибка обработки webhook:', error);
    throw error;
  }
}
