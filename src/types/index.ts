export interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: 'user' | 'admin';
  coin_balance: number;
  is_verified: number;
  api_key?: string;
}

export interface Service {
  id: number;
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'facebook' | string;
  service_type: string;
  name: string;
  description?: string;
  coin_price_per_1000: number;
  min_quantity: number;
  max_quantity: number;
  delivery_speed: string;
  is_active: number;
}

export interface Order {
  id: number;
  user_id: number;
  service_id: number;
  service_name?: string;
  platform?: string;
  service_type?: string;
  delivery_speed?: string;
  user_email?: string;
  user_name?: string;
  link_or_username: string;
  quantity: number;
  coin_cost: number;
  naira_equivalent: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  external_order_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  user_email?: string;
  user_name?: string;
  type: 'deposit' | 'order' | 'refund' | 'admin_adjustment';
  amount_naira: number;
  amount_coins: number;
  balance_after: number;
  reference: string;
  payment_gateway?: string;
  status: 'pending' | 'completed' | 'failed';
  description?: string;
  created_at: string;
}

export interface CoinPackage {
  id: number;
  name: string;
  naira_price: number;
  coins: number;
  bonus_coins: number;
  badge?: string;
  is_active: number;
}

export interface AdminStats {
  totalUsers: number;
  bannedUsers: number;
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalCoinsSpent: number;
  totalNairaRevenue: number;
  coinsInCirculation: number;
  recentOrders: Order[];
  dailyData: {
    date: string;
    order_count: number;
    coins_volume: number;
    naira_volume: number;
  }[];
}
