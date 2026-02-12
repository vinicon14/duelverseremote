import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit, Trash2, Save, X, Coins, DollarSign, Package } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string;
  product_type: 'normal' | 'duelcoins' | 'cashout';
  duelcoins_amount: number | null;
  cashout_fee_percentage: number;
  stock_quantity: number;
  is_active: boolean;
  is_digital: boolean;
  delivery_info: string | null;
  created_at: string;
  updated_at: string;
}

export default function ShopManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    description: '',
    price: 0,
    image_url: '',
    category: 'normal',
    product_type: 'normal',
    duelcoins_amount: 0,
    cashout_fee_percentage: 0,
    stock_quantity: 1,
    is_active: true,
    is_digital: false,
    delivery_info: ''
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching products:', error);
        throw error;
      }
      setProducts(data || []);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      toast({
        title: "Erro ao carregar produtos",
        description: error.message || "Ocorreu um erro ao carregar os produtos.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const productData = {
        ...formData,
        updated_at: new Date().toISOString()
      };

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from('shop_products')
          .update(productData)
          .eq('id', editingProduct.id);
        
        if (error) throw error;
        
        toast({
          title: "Produto atualizado",
          description: "O produto foi atualizado com sucesso."
        });
      } else {
        // Create new product
        const { error } = await supabase
          .from('shop_products')
          .insert({
            ...productData,
            created_at: new Date().toISOString()
          });
        
        if (error) throw error;
        
        toast({
          title: "Produto criado",
          description: "O produto foi criado com sucesso."
        });
      }

      resetForm();
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast({
        title: "Erro ao salvar produto",
        description: error.message || "Ocorreu um erro ao salvar o produto.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    
    try {
      const { error } = await supabase
        .from('shop_products')
        .delete()
        .eq('id', productId);
      
      if (error) {
        console.error('Error deleting product:', error);
        throw error;
      }
      
      toast({
        title: "Produto excluído",
        description: "O produto foi excluído com sucesso."
      });
      
      fetchProducts();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast({
        title: "Erro ao excluir produto",
        description: error.message || "Ocorreu um erro ao excluir o produto.",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      price: 0,
      image_url: '',
      category: 'normal',
      product_type: 'normal',
      duelcoins_amount: 0,
      cashout_fee_percentage: 0,
      stock_quantity: 1,
      is_active: true,
      is_digital: false,
      delivery_info: ''
    });
    setEditingProduct(null);
    setShowForm(false);
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData(product);
    setShowForm(true);
  };

  const getProductTypeIcon = (type: string) => {
    switch (type) {
      case 'duelcoins':
        return <Coins className="w-4 h-4 text-yellow-500" />;
      case 'cashout':
        return <DollarSign className="w-4 h-4 text-green-500" />;
      default:
        return <Package className="w-4 h-4 text-blue-500" />;
    }
  };

  const getProductTypeBadge = (type: string) => {
    switch (type) {
      case 'duelcoins':
        return <Badge className="bg-yellow-500">DuelCoins</Badge>;
      case 'cashout':
        return <Badge className="bg-green-500">Resgate</Badge>;
      default:
        return <Badge className="bg-blue-500">Normal</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento da Loja</h1>
          <p className="text-muted-foreground">
            Gerencie produtos, DuelCoins e resgates
          </p>
        </div>
        <Button 
          onClick={() => setShowForm(true)}
          className="btn-mystic"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
              >
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Ex: Cards, Acessórios, etc."
                  />
                </div>

                <div>
                  <Label htmlFor="product_type">Tipo de Produto</Label>
                  <Select
                    value={formData.product_type}
                    onValueChange={(value: 'normal' | 'duelcoins' | 'cashout') => 
                      setFormData({ ...formData, product_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal (entrega externa)</SelectItem>
                      <SelectItem value="duelcoins">DuelCoins (moeda do jogo)</SelectItem>
                      <SelectItem value="cashout">Resgate (saque de DuelCoins)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.product_type === 'duelcoins' && (
                  <div>
                    <Label htmlFor="duelcoins_amount">Quantidade de DuelCoins</Label>
                    <Input
                      id="duelcoins_amount"
                      type="number"
                      min="0"
                      value={formData.duelcoins_amount}
                      onChange={(e) => setFormData({ ...formData, duelcoins_amount: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                )}

                {formData.product_type === 'cashout' && (
                  <div>
                    <Label htmlFor="cashout_fee_percentage">Taxa de Resgate (%)</Label>
                    <Input
                      id="cashout_fee_percentage"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.cashout_fee_percentage}
                      onChange={(e) => setFormData({ ...formData, cashout_fee_percentage: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="stock_quantity">Estoque</Label>
                  <Input
                    id="stock_quantity"
                    type="number"
                    min="0"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="image_url">URL da Imagem</Label>
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              {formData.product_type !== 'cashout' && (
                <div>
                  <Label htmlFor="delivery_info">Informações de Entrega</Label>
                  <Textarea
                    id="delivery_info"
                    value={formData.delivery_info}
                    onChange={(e) => setFormData({ ...formData, delivery_info: e.target.value })}
                    rows={2}
                    placeholder="Prazo de entrega, forma de envio, etc."
                  />
                </div>
              )}

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Produto Ativo</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_digital"
                    checked={formData.is_digital}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_digital: checked })}
                  />
                  <Label htmlFor="is_digital">Produto Digital</Label>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <Card key={product.id} className={product.is_active ? '' : 'opacity-50'}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {getProductTypeIcon(product.product_type)}
                  <CardTitle className="text-lg">{product.title}</CardTitle>
                </div>
                {getProductTypeBadge(product.product_type)}
              </div>
              <CardDescription className="line-clamp-2">
                {product.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.image_url && (
                <img 
                  src={product.image_url} 
                  alt={product.title}
                  className="w-full h-40 object-cover rounded-md mb-4"
                />
              )}
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-green-600">
                    R$ {product.price.toFixed(2)}
                  </span>
                  <Badge variant={product.stock_quantity > 0 ? "default" : "destructive"}>
                    Estoque: {product.stock_quantity}
                  </Badge>
                </div>

                {product.product_type === 'duelcoins' && (
                  <div className="flex items-center gap-2 text-yellow-600">
                    <Coins className="w-4 h-4" />
                    <span>{product.duelcoins_amount} DuelCoins</span>
                  </div>
                )}

                {product.product_type === 'cashout' && (
                  <div className="text-sm text-red-600">
                    Taxa: {product.cashout_fee_percentage}%
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{product.category}</Badge>
                  {product.is_digital && <Badge variant="outline">Digital</Badge>}
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(product)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(product.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {products.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum produto encontrado</h3>
            <p className="text-muted-foreground mb-4">
              Comece adicionando produtos à loja usando o botão acima.
            </p>
            <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 p-3 rounded">
              <AlertTriangle className="w-4 h-4" />
              <span>Atenção: Verifique se as tabelas da loja foram criadas no Supabase</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}