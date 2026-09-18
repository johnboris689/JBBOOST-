export interface SmmProvider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string; // Encrypted in DB, decrypted in memory
  status: 'active' | 'inactive';
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderServiceItem {
  service: string | number;
  name: string;
  type?: string;
  category?: string;
  rate: number | string; // Cost per 1000 in provider currency
  min: number | string;
  max: number | string;
  dripfeed?: boolean;
  refill?: boolean;
  cancel?: boolean;
}

export interface ProviderOrderStatus {
  status: 'Pending' | 'In progress' | 'Completed' | 'Partial' | 'Canceled' | 'Processing' | string;
  charge?: number | string;
  start_count?: number | string;
  remains?: number | string;
  currency?: string;
  error?: string;
}

export interface AddOrderParams {
  service: string | number;
  link: string;
  quantity: number;
  comments?: string;
  runs?: number;
  interval?: number;
}

export interface AddOrderResult {
  orderId: string;
  rawResponse?: any;
}

export interface ProviderLogEntry {
  id: string;
  providerId: string;
  providerName?: string;
  orderId?: string;
  action: string;
  requestPayload: string;
  responsePayload: string;
  httpStatus: number;
  durationMs: number;
  error?: string;
  createdAt: string;
}

export interface ISmmAdapter {
  getBalance(): Promise<{ balance: number; currency: string }>;
  getServices(): Promise<ProviderServiceItem[]>;
  createOrder(params: AddOrderParams): Promise<AddOrderResult>;
  getOrderStatus(orderId: string): Promise<ProviderOrderStatus>;
  getOrderStatuses(orderIds: string[]): Promise<Record<string, ProviderOrderStatus>>;
}
