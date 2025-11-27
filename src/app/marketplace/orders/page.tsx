// src/app/marketplace/orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { supabase } from '@/lib/supabase';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Search,
  Filter as FilterIcon,
} from 'lucide-react';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

interface Order {
  id: string;
  buyer_address: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_paid_self: number;
  price_paid_system: number;
  transaction_hash: string;
  status: 'processing' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  fulfillment_manager_address?: string;
  shipping_address?: any;
  tracking_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export default function OrderManagementPage() {
  const router = useRouter();
  const { address } = useAccount();

  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [canManageOrders, setCanManageOrders] = useState(false);

  // Filter states
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    processing: 0,
    preparing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  });

  useEffect(() => {
    if (!address) return;
    checkPermissionsAndLoadOrders();
  }, [address]);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter, searchFilter]);

  const checkPermissionsAndLoadOrders = async () => {
    if (!address) return;

    try {
      setIsLoading(true);
      setError('');

      // Check if user has management permissions
      const tokenBalances = await fetchTokenBalances(address);
      const hasExecutivePod = tokenBalances.hasExecutivePod;
      const hasMarketManagement = tokenBalances.hasMarketManagement;

      if (!hasExecutivePod && !hasMarketManagement) {
        setError(
          'You do not have permission to manage orders. You need Executive Pod membership or Market Management tokens.',
        );
        setCanManageOrders(false);
        return;
      }

      setCanManageOrders(true);

      // Load orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('marketplace_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        setError('Failed to load orders');
        return;
      }

      setOrders(ordersData || []);
      calculateStats(ordersData || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      setError('Failed to load order management data');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = (orderData: Order[]) => {
    const stats = {
      total: orderData.length,
      processing: orderData.filter((o) => o.status === 'processing').length,
      preparing: orderData.filter((o) => o.status === 'preparing').length,
      shipped: orderData.filter((o) => o.status === 'shipped').length,
      delivered: orderData.filter((o) => o.status === 'delivered').length,
      cancelled: orderData.filter((o) => o.status === 'cancelled').length,
    };
    setStats(stats);
  };

  const applyFilters = () => {
    let filtered = [...orders];

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    if (searchFilter) {
      filtered = filtered.filter(
        (order) =>
          order.product_name
            .toLowerCase()
            .includes(searchFilter.toLowerCase()) ||
          order.buyer_address
            .toLowerCase()
            .includes(searchFilter.toLowerCase()) ||
          order.id.toLowerCase().includes(searchFilter.toLowerCase()),
      );
    }

    setFilteredOrders(filtered);
  };

  const handleQuickStatusUpdate = async (
    orderId: string,
    newStatus: string,
  ) => {
    try {
      const { error } = await supabase
        .from('marketplace_orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          fulfillment_manager_address: address,
        })
        .eq('id', orderId);

      if (error) {
        console.error('Error updating order status:', error);
        return;
      }

      // Add to status history
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        old_status: orders.find((o) => o.id === orderId)?.status,
        new_status: newStatus,
        changed_by_address: address,
        notes: `Quick update from order management dashboard`,
      });

      // Refresh orders
      await checkPermissionsAndLoadOrders();
    } catch (error) {
      console.error('Error updating order:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="w-4 h-4" />;
      case 'preparing':
        return <Package className="w-4 h-4" />;
      case 'shipped':
        return <Truck className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'processing':
        return 'secondary';
      case 'preparing':
        return 'outline';
      case 'shipped':
        return 'default';
      case 'delivered':
        return 'default';
      case 'cancelled':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (selfPrice: number, systemPrice: number) => {
    const parts = [];
    if (selfPrice > 0) parts.push(`${selfPrice} $SELF`);
    if (systemPrice > 0) parts.push(`${systemPrice} $SYSTEM`);
    return parts.join(' + ') || '0';
  };

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 bottom-nav-spacing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Order Management
            </h1>
            <p className="text-gray-600">
              Please connect your wallet to access order management.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 bottom-nav-spacing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-48 mx-auto mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !canManageOrders) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 bottom-nav-spacing">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/market')}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Market
            </Button>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Order Management
            </h1>
          </div>
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-6 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Access Denied
              </h3>
              <p className="text-gray-600">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 bottom-nav-spacing">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push('/market')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Market
          </Button>

          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Order Management
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Manage and fulfill customer orders. Track order status, update
              shipping information, and communicate with buyers.
            </p>
          </div>

          {/* Quick Stats - Two row layout to prevent overflow */}
          <div className="space-y-3 mb-6 max-w-3xl mx-auto">
            {/* First Row: Total, Processing, Preparing */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Card className="shadow-sm">
                <CardContent className="p-3 sm:p-4 text-center">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-blue-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {stats.total}
                  </p>
                  <p className="text-xs text-gray-600">Total</p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-3 sm:p-4 text-center">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-yellow-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {stats.processing}
                  </p>
                  <p className="text-xs text-gray-600">Processing</p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-3 sm:p-4 text-center">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-orange-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {stats.preparing}
                  </p>
                  <p className="text-xs text-gray-600">Preparing</p>
                </CardContent>
              </Card>
            </div>

            {/* Second Row: Shipped, Delivered */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 max-w-md mx-auto">
              <Card className="shadow-sm">
                <CardContent className="p-3 sm:p-4 text-center">
                  <Truck className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {stats.shipped}
                  </p>
                  <p className="text-xs text-gray-600">Shipped</p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-3 sm:p-4 text-center">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-green-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-gray-900">
                    {stats.delivered}
                  </p>
                  <p className="text-xs text-gray-600">Delivered</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Filters - Centered like events */}
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search orders, products, buyer names..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-64"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <FilterIcon className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {(statusFilter || searchFilter) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter('');
                  setSearchFilter('');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <Card className="max-w-2xl mx-auto">
              <CardContent className="p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {orders.length === 0
                    ? 'No Orders Yet'
                    : 'No Orders Match Filters'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {orders.length === 0
                    ? 'Orders will appear here when customers make purchases.'
                    : 'Try adjusting your search or filter criteria.'}
                </p>
                {orders.length === 0 && (
                  <Button onClick={() => router.push('/market')}>
                    Visit Marketplace
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Card
                key={order.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/marketplace/orders/${order.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          {order.product_name}
                        </h3>
                        <Badge
                          variant={getStatusVariant(order.status)}
                          className="ml-2"
                        >
                          {getStatusIcon(order.status)}
                          <span className="ml-1 capitalize">
                            {order.status}
                          </span>
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Buyer:</span>
                          <br />
                          <UserProfileDisplay
                            walletAddress={order.buyer_address}
                            size="sm"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <span className="font-medium">Quantity:</span>
                          <br />
                          {order.quantity}
                        </div>
                        <div>
                          <span className="font-medium">Total:</span>
                          <br />
                          {formatPrice(
                            order.price_paid_self,
                            order.price_paid_system,
                          )}
                        </div>
                        <div>
                          <span className="font-medium">Date:</span>
                          <br />
                          {formatDate(order.created_at)}
                        </div>
                      </div>

                      {order.tracking_number && (
                        <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                          <span className="font-medium text-blue-900">
                            Tracking:
                          </span>{' '}
                          {order.tracking_number}
                        </div>
                      )}
                    </div>

                    <div
                      className="flex space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.status === 'processing' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleQuickStatusUpdate(order.id, 'preparing')
                          }
                        >
                          Start Prep
                        </Button>
                      )}
                      {order.status === 'preparing' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleQuickStatusUpdate(order.id, 'shipped')
                          }
                        >
                          Mark Shipped
                        </Button>
                      )}
                      {order.status === 'shipped' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleQuickStatusUpdate(order.id, 'delivered')
                          }
                        >
                          Mark Delivered
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(`/marketplace/orders/${order.id}`)
                        }
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
