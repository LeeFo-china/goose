create extension if not exists "pgcrypto";

-- 部门
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name varchar(50) not null,
  code varchar(50) unique,  created_at timestamp default now()
);

-- 员工
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name varchar(50),
  phone varchar(20),
  department_id uuid references departments(id),
  role varchar(50),
  status varchar(20) default 'active',
  created_at timestamp default now()
);

-- 客户
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name varchar(50),
  phone varchar(20),
  source varchar(50),
  status varchar(20) default 'lead',
  owner_id uuid references employees(id),
  created_at timestamp default now()
);

-- 项目
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name varchar(100),
  customer_id uuid references customers(id),
  address text,
  status varchar(50),
  budget numeric,
  created_at timestamp default now()
);

-- 收款
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  amount numeric,
  type varchar(50),
  status varchar(20),
  created_at timestamp default now()
);