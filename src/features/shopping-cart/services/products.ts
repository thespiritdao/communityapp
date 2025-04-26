// src\features\shopping-cart\services\products.ts

import { createClient } from "@supabase/supabase-js";
import { IProduct } from "models";

// ✅ Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch products from Supabase
 * @returns {Promise<IProduct[]>} List of products
 */
export const getProducts = async (): Promise<IProduct[]> => {
  try {
    const { data, error } = await supabase.from("products").select("*");

    if (error) {
      console.error("❌ Error fetching products:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("❌ Unexpected error fetching products:", error);
    return [];
  }
};
