import { FieldRecord } from '../types';

const STORAGE_KEY = 'local_fields_data';

export const getLocalFields = (): FieldRecord[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((field: any) => {
      if (field.createdAt && typeof field.createdAt === 'object' && !field.createdAt.toMillis) {
         field.createdAt.toMillis = () => field.createdAt.seconds * 1000;
         field.createdAt.toDate = () => new Date(field.createdAt.seconds * 1000);
      }
      if (field.updatedAt && typeof field.updatedAt === 'object' && !field.updatedAt.toMillis) {
         field.updatedAt.toMillis = () => field.updatedAt.seconds * 1000;
         field.updatedAt.toDate = () => new Date(field.updatedAt.seconds * 1000);
      }
      return field;
    });
  } catch (e) {
    console.error('Error parsing local fields:', e);
    return [];
  }
};

export const saveLocalFields = (fields: FieldRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    // Trigger custom event so all components update reactively
    window.dispatchEvent(new CustomEvent('local-fields-changed'));
  } catch (e) {
    console.error('Error saving local fields:', e);
  }
};

export const addLocalField = (fieldData: Omit<FieldRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
  const fields = getLocalFields();
  const newField: FieldRecord = {
    ...fieldData,
    id: 'local_' + Math.random().toString(36).substring(2, 11),
    createdAt: {
      toMillis: () => Date.now(),
      toDate: () => new Date(),
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: (Date.now() % 1000) * 1000000,
    } as any,
    updatedAt: {
      toMillis: () => Date.now(),
      toDate: () => new Date(),
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: (Date.now() % 1000) * 1000000,
    } as any,
  };
  fields.push(newField);
  saveLocalFields(fields);
  return newField;
};

export const updateLocalField = (id: string, updatedData: Partial<FieldRecord>) => {
  const fields = getLocalFields();
  const idx = fields.findIndex((f) => f.id === id);
  if (idx !== -1) {
    fields[idx] = {
      ...fields[idx],
      ...updatedData,
      updatedAt: {
        toMillis: () => Date.now(),
        toDate: () => new Date(),
        seconds: Math.floor(Date.now() / 1000),
        nanoseconds: (Date.now() % 1000) * 1000000,
      } as any,
    };
    saveLocalFields(fields);
  }
};

export const deleteLocalField = (id: string) => {
  const fields = getLocalFields();
  const filtered = fields.filter((f) => f.id !== id);
  saveLocalFields(filtered);
};
