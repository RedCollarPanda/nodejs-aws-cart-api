import { Injectable } from '@nestjs/common';
import { Order } from '../models';
import { Address, CreateOrderPayload, OrderStatus } from '../type';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class OrderService {
  constructor(private db: DatabaseService) {}

  async getAll(): Promise<Order[]> {
    const rows = await this.db.query<any>(`SELECT * FROM orders`);
    return rows.map((row) => this.rowToOrder(row));
  }

  async findById(orderId: string): Promise<Order | null> {
    const [row] = await this.db.query<any>(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId],
    );
    return row ? this.rowToOrder(row) : null;
  }

  async create(data: CreateOrderPayload): Promise<Order> {
    const [row] = await this.db.query<any>(
      `INSERT INTO orders (user_id, cart_id, delivery, status, total)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.userId, data.cartId, JSON.stringify(data.address), OrderStatus.Open, data.total],
    );
    return this.rowToOrder(row, data.items);
  }

  async createWithTransaction(data: CreateOrderPayload): Promise<Order> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (user_id, cart_id, delivery, status, total)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.userId, data.cartId, JSON.stringify(data.address), OrderStatus.Open, data.total],
      );

      await client.query(
        `UPDATE carts SET status = 'ORDERED', updated_at = NOW() WHERE id = $1`,
        [data.cartId],
      );

      await client.query('COMMIT');
      return this.rowToOrder(orderRows[0], data.items);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async update(orderId: string, data: Partial<Order>): Promise<void> {
    await this.db.query(
      `UPDATE orders SET status = $2, delivery = $3 WHERE id = $1`,
      [orderId, data['status'] ?? OrderStatus.Open, JSON.stringify(data['address'])],
    );
  }

  private rowToOrder(row: any, items?: Array<{ productId: string; count: number }>): Order {
    return {
      id: row.id,
      userId: row.user_id,
      cartId: row.cart_id,
      address: row.delivery ?? {},
      items: items ?? [],
      statusHistory: [
        { status: OrderStatus.Open, timestamp: Date.now(), comment: '' },
      ],
    };
  }
}
