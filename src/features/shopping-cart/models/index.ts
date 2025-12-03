export interface IProduct {
  id: number;
  sku: number;
  title: string;
  name?: string; // Alternative name field used by database
  description: string;
  availableSizes: string[];
  available_sizes?: string[]; // Database field name
  style: string;
  price: number;
  installments: number;
  currencyId: string;
  currencyFormat: string;
  isFreeShipping: boolean;
  // Token gating fields (database uses required_token, some components use requiredToken)
  required_token?: string | null;
  requiredToken?: string | null;
  // New pricing fields for multi-token support
  price_self?: number;
  price_system?: number;
  // Product management fields
  quantity?: number;
  units_available?: number;
  image_url?: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
  // Fund routing fields
  fund_destination_type?: 'burn' | 'wallet' | 'pod_treasury';
  destination_address?: string | null;
  creator_wallet?: string;
  pod_id?: string | null;
}

export interface ICartProduct extends IProduct {
  quantity: number;
  selectedSize?: string;
}

export interface ICartTotal {
  productQuantity: number;
  installments: number;
  totalPrice: number;
  currencyId: string;
  currencyFormat: string;
  totalSystemPrice?: number;
  totalSelfPrice?: number;
}

export interface IGetProductsResponse {
  data: {
    products: IProduct[];
  };
}
