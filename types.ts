export interface FieldRecord {
  id: string;
  ownerId: string;
  name: string;
  province: string;
  district: string;
  neighborhood: string;
  ada: string;
  parsel: string;
  latitude: number;
  longitude: number;
  cropType: string;
  notes?: string;
  polygon?: any;
  createdAt: any;
  updatedAt: any;
}
