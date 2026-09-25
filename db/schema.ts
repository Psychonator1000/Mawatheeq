import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const cases=sqliteTable('cases',{id:text('id').primaryKey(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),archived:integer('archived').notNull().default(0)});
export const documents=sqliteTable('documents',{id:text('id').primaryKey(),payload:text('payload').notNull(),fileKey:text('file_key'),filename:text('filename').notNull(),updatedAt:text('updated_at').notNull()});
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const audit=sqliteTable('audit',{id:text('id').primaryKey(),caseId:text('case_id'),action:text('action').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull()});
