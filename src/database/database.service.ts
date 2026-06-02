import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  async onModuleInit() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'cart_db',
      user: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  getPool(): Pool {
    return this.pool;
  }

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }
}
