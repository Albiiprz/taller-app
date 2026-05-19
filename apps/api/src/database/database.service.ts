import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5433),
      user: process.env.DB_USER ?? 'taller',
      password: process.env.DB_PASSWORD ?? 'taller',
      database: process.env.DB_NAME ?? 'taller',
      max: Number(process.env.DB_POOL_MAX ?? 10),
    });
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    await this.ensureSchema();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  private async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        roles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        login_name TEXT,
        pin TEXT,
        phone TEXT,
        email TEXT,
        birth_date TEXT,
        extra TEXT,
        avatar_data_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS login_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS extra TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS roles_json JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      UPDATE users
      SET roles_json = jsonb_build_array(role)
      WHERE role IS NOT NULL
        AND (
          roles_json IS NULL
          OR jsonb_typeof(roles_json) <> 'array'
          OR jsonb_array_length(roles_json) = 0
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_name ON users(login_name);

      CREATE TABLE IF NOT EXISTS clients (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicles (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
        plate TEXT NOT NULL UNIQUE,
        vin TEXT,
        vehicle_type TEXT,
        tachograph_model TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id BIGSERIAL PRIMARY KEY,
        plate TEXT NOT NULL,
        title TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
        vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
        assigned_to_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        scheduled_start TIMESTAMPTZ,
        scheduled_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
      CREATE INDEX IF NOT EXISTS idx_work_orders_plate ON work_orders(plate);

      CREATE TABLE IF NOT EXISTS audit_events (
        id BIGSERIAL PRIMARY KEY,
        work_order_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        actor_role TEXT,
        actor_name TEXT,
        origin TEXT NOT NULL DEFAULT 'web',
        reason TEXT,
        before_json JSONB,
        after_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'web';
      ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS reason TEXT;
      ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS before_json JSONB;
      ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS after_json JSONB;

      CREATE INDEX IF NOT EXISTS idx_audit_events_work_order_id ON audit_events(work_order_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);

      CREATE TABLE IF NOT EXISTS work_order_notes (
        id BIGSERIAL PRIMARY KEY,
        work_order_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        actor_role TEXT,
        actor_name TEXT,
        origin TEXT NOT NULL DEFAULT 'web',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE work_order_notes ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'web';

      CREATE INDEX IF NOT EXISTS idx_work_order_notes_work_order_id ON work_order_notes(work_order_id);

      CREATE TABLE IF NOT EXISTS work_order_checklists (
        work_order_id BIGINT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
        km TEXT NOT NULL DEFAULT '',
        fuel TEXT NOT NULL DEFAULT '1/2',
        damages BOOLEAN NOT NULL DEFAULT FALSE,
        damages_text TEXT NOT NULL DEFAULT '',
        has_keys BOOLEAN NOT NULL DEFAULT TRUE,
        has_docs BOOLEAN NOT NULL DEFAULT TRUE,
        has_tacho_card BOOLEAN NOT NULL DEFAULT FALSE,
        tacho_issue BOOLEAN NOT NULL DEFAULT FALSE,
        extra TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_order_time (
        work_order_id BIGINT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
        total_seconds INTEGER NOT NULL DEFAULT 0,
        running BOOLEAN NOT NULL DEFAULT FALSE,
        started_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_order_time_sessions (
        id BIGSERIAL PRIMARY KEY,
        work_order_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        total_seconds INTEGER NOT NULL DEFAULT 0,
        actor_role TEXT,
        actor_name TEXT,
        origin TEXT NOT NULL DEFAULT 'web',
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_work_order_time_sessions_work_order_id
        ON work_order_time_sessions(work_order_id);

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        stock INTEGER NOT NULL DEFAULT 0,
        min_stock INTEGER NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'ud',
        location TEXT NOT NULL DEFAULT '',
        barcode TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_not_null ON products(barcode) WHERE barcode IS NOT NULL;

      CREATE TABLE IF NOT EXISTS stock_moves (
        id BIGSERIAL PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        qty INTEGER NOT NULL,
        reason TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        work_order_id BIGINT REFERENCES work_orders(id) ON DELETE SET NULL,
        actor_role TEXT,
        actor_name TEXT,
        origin TEXT NOT NULL DEFAULT 'web',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';
      ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'web';

      CREATE INDEX IF NOT EXISTS idx_stock_moves_product_id ON stock_moves(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_moves_work_order_id ON stock_moves(work_order_id);

      CREATE TABLE IF NOT EXISTS technician_profiles (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS technician_schedule_rules (
        id BIGSERIAL PRIMARY KEY,
        technician_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        week_pattern TEXT NOT NULL DEFAULT 'ALL',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE technician_schedule_rules
        ADD COLUMN IF NOT EXISTS week_pattern TEXT NOT NULL DEFAULT 'ALL';

      CREATE INDEX IF NOT EXISTS idx_tech_schedule_tech_day
        ON technician_schedule_rules(technician_id, day_of_week);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
        vehicle_id BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
        technician_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
        work_order_id BIGINT REFERENCES work_orders(id) ON DELETE SET NULL,
        google_event_id TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        work_type TEXT,
        notes TEXT NOT NULL DEFAULT '',
        start_at TIMESTAMPTZ,
        end_at TIMESTAMPTZ,
        cancel_reason TEXT,
        cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE appointments ALTER COLUMN technician_id DROP NOT NULL;
      ALTER TABLE appointments ALTER COLUMN work_type DROP NOT NULL;
      ALTER TABLE appointments ALTER COLUMN start_at DROP NOT NULL;
      ALTER TABLE appointments ALTER COLUMN end_at DROP NOT NULL;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_appointments_technician_time
        ON appointments(technician_id, start_at, end_at);
      CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id
        ON appointments(google_event_id);

      CREATE TABLE IF NOT EXISTS time_blocks (
        id BIGSERIAL PRIMARY KEY,
        technician_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        source_id BIGINT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_time_blocks_technician_time
        ON time_blocks(technician_id, start_at, end_at);

      CREATE TABLE IF NOT EXISTS notification_jobs (
        id BIGSERIAL PRIMARY KEY,
        appointment_id BIGINT REFERENCES appointments(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        run_at TIMESTAMPTZ NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_run_at
        ON notification_jobs(status, run_at);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
        ON push_subscriptions(user_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_role TEXT,
        actor_name TEXT,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

      INSERT INTO products (id, name, stock, min_stock, unit)
      VALUES ('TACO-001', 'Sensor velocidad', 20, 6, 'ud')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO products (id, name, stock, min_stock, unit)
      VALUES ('TACO-017', 'Cable CAN', 25, 8, 'ud')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO products (id, name, stock, min_stock, unit)
      VALUES ('MANT-110', 'Filtro aceite', 40, 10, 'ud')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Admin', 'Administración', 'admin', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Oficina', 'Oficina', 'oficina', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Técnico', 'Técnico', 'tecnico', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Jefe Taller', 'Jefe de Taller', 'jefe', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Contabilidad', 'Contabilidad', 'conta', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Inventario', 'Inventario', 'inventario', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Alberto', 'Técnico', 'alberto', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Daniel', 'Técnico', 'daniel', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Miguel', 'Técnico', 'miguel', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Victor', 'Técnico', 'victor', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Mariangeles', 'Oficina', 'mariangeles', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Sara', 'Oficina', 'sara', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      INSERT INTO users (name, role, login_name, pin, is_active)
      VALUES ('Marisa', 'Oficina', 'marisa', '1234', TRUE)
      ON CONFLICT (login_name) DO NOTHING;

      UPDATE users SET role = 'Técnico', roles_json = '["Técnico","Jefe de Taller"]'::jsonb WHERE login_name = 'daniel';
      UPDATE users SET role = 'Técnico', roles_json = '["Técnico","Inventario"]'::jsonb WHERE login_name = 'victor';
      UPDATE users SET role = 'Oficina', roles_json = '["Oficina","Administración"]'::jsonb WHERE login_name = 'sara';
      UPDATE users SET role = 'Oficina', roles_json = '["Oficina","Administración","Contabilidad"]'::jsonb WHERE login_name = 'marisa';
      UPDATE users SET is_active = FALSE WHERE login_name IN ('daniel_jefe', 'victor_inventario', 'sara_admin', 'marisa_admin', 'marisa_conta');
      UPDATE users SET roles_json = jsonb_build_array(role)
      WHERE role IS NOT NULL
        AND (
          roles_json IS NULL
          OR jsonb_typeof(roles_json) <> 'array'
          OR jsonb_array_length(roles_json) = 0
        );
    `);
  }
}
