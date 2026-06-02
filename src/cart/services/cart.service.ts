import { Injectable } from '@nestjs/common';
import { Cart, CartStatuses } from '../models';
import { PutCartPayload } from 'src/order/type';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class CartService {
  constructor(private db: DatabaseService) {}

  async findByUserId(userId: string): Promise<Cart | null> {
    const [cart] = await this.db.query<any>(
      `SELECT * FROM carts WHERE user_id = $1 AND status = 'OPEN' LIMIT 1`,
      [userId],
    );
    if (!cart) return null;

    const items = await this.db.query<any>(
      `SELECT * FROM cart_items WHERE cart_id = $1`,
      [cart.id],
    );

    return {
      ...cart,
      items: items.map((row) => ({
        product: { id: row.product_id, title: '', description: '', price: Number(row.price) },
        count: row.count,
      })),
    };
  }

  async createByUserId(user_id: string): Promise<Cart> {
    const [cart] = await this.db.query<any>(
      `INSERT INTO carts (user_id, status) VALUES ($1, 'OPEN') RETURNING *`,
      [user_id],
    );
    return { ...cart, items: [] };
  }

  async findOrCreateByUserId(userId: string): Promise<Cart> {
    const cart = await this.findByUserId(userId);
    return cart ?? this.createByUserId(userId);
  }

  async updateByUserId(userId: string, payload: PutCartPayload): Promise<Cart> {
    const cart = await this.findOrCreateByUserId(userId);

    const [existing] = await this.db.query<any>(
      `SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
      [cart.id, payload.product.id],
    );

    if (!existing) {
      if (payload.count > 0) {
        await this.db.query(
          `INSERT INTO cart_items (cart_id, product_id, count, price) VALUES ($1, $2, $3, $4)`,
          [cart.id, payload.product.id, payload.count, payload.product.price],
        );
      }
    } else if (payload.count === 0) {
      await this.db.query(
        `DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
        [cart.id, payload.product.id],
      );
    } else {
      await this.db.query(
        `UPDATE cart_items SET count = $3, price = $4 WHERE cart_id = $1 AND product_id = $2`,
        [cart.id, payload.product.id, payload.count, payload.product.price],
      );
    }

    await this.db.query(
      `UPDATE carts SET updated_at = NOW() WHERE id = $1`,
      [cart.id],
    );

    return this.findByUserId(userId);
  }

  async removeByUserId(userId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM cart_items WHERE cart_id = (
        SELECT id FROM carts WHERE user_id = $1 AND status = 'OPEN' LIMIT 1
      )`,
      [userId],
    );
  }
}
