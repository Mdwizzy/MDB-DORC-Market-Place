export type Product = { id: string; name: string; description: string; category: string; price: number; oldPrice?: number; rating: number; reviews: number; stock: number; seller: string; emoji: string; tone: string; badge?: string; imageUrl?: string; imageUrls?: string[] };
export type MarketplaceCategory = { id?: string; name: string; slug: string; emoji: string; tone: string; active?: boolean };
export const marketplaceCategories: MarketplaceCategory[] = [
  { name: "Electronics", slug: "electronics", emoji: "🎧", tone: "cat-lav" },
  { name: "Phones & Tablets", slug: "phones-tablets", emoji: "📱", tone: "cat-mint" },
  { name: "Computers & Accessories", slug: "computers-accessories", emoji: "💻", tone: "cat-lemon" },
  { name: "Fashion", slug: "fashion", emoji: "🧢", tone: "cat-peach" },
  { name: "Beauty & Personal Care", slug: "beauty-personal-care", emoji: "💄", tone: "cat-lav" },
  { name: "Health & Wellness", slug: "health-wellness", emoji: "🩺", tone: "cat-mint" },
  { name: "Home & Living", slug: "home-living", emoji: "🪴", tone: "cat-mint" },
  { name: "Kitchen & Dining", slug: "kitchen-dining", emoji: "🍽️", tone: "cat-lemon" },
  { name: "Groceries & Food", slug: "groceries-food", emoji: "🥑", tone: "cat-peach" },
  { name: "Baby, Kids & Toys", slug: "baby-kids-toys", emoji: "🧸", tone: "cat-lav" },
  { name: "Sports & Fitness", slug: "sports-fitness", emoji: "🏋️", tone: "cat-mint" },
  { name: "Books & Stationery", slug: "books-stationery", emoji: "✏️", tone: "cat-lemon" },
  { name: "Automotive & Tools", slug: "automotive-tools", emoji: "🔧", tone: "cat-peach" },
];
export const categories = ["All products", ...marketplaceCategories.map((category) => category.name)];
export const formatNaira = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
