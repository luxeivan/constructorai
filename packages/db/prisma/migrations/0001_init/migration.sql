-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_photos" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_id" UUID NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_rooms" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "room_type" TEXT,
    "wall_length_mm" INTEGER,
    "width_mm" INTEGER,
    "depth_mm" INTEGER,
    "height_mm" INTEGER,
    "has_window" BOOLEAN NOT NULL DEFAULT false,
    "has_door" BOOLEAN NOT NULL DEFAULT false,
    "features_json" JSONB,
    "confirmed_by_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wizard_answers" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "question_key" TEXT NOT NULL,
    "answer_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wizard_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_selections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT 'initial',
    "total_rub" INTEGER NOT NULL DEFAULT 0,
    "layout_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_items" (
    "id" UUID NOT NULL,
    "selection_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_price_rub" INTEGER NOT NULL,
    "position_json" JSONB,

    CONSTRAINT "selection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_renders" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "selection_id" UUID,
    "kind" TEXT NOT NULL,
    "variant_index" INTEGER NOT NULL DEFAULT 0,
    "file_id" UUID NOT NULL,
    "prompt" TEXT,
    "model" TEXT,
    "cost_rub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_renders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "render_id" UUID,
    "text" TEXT NOT NULL,
    "intent_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "total_rub" INTEGER NOT NULL DEFAULT 0,
    "pdf_file_id" UUID,
    "snapshot_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "name" TEXT NOT NULL,
    "article" TEXT NOT NULL,
    "dimensions" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "price_rub" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_categories" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_models" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand_series" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_variants" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "external_id" INTEGER NOT NULL,
    "article" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_rub" INTEGER NOT NULL DEFAULT 0,
    "width_mm" INTEGER,
    "depth_mm" INTEGER,
    "height_mm" INTEGER,
    "color" TEXT,
    "shelf_load_kg" INTEGER,
    "image_file_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "has_dimensions" BOOLEAN NOT NULL DEFAULT false,
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_props" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_text" TEXT,
    "value_num" DOUBLE PRECISION,

    CONSTRAINT "catalog_props_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "payload_json" JSONB,
    "result_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "step" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_rub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_login_key" ON "admin_users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE INDEX "projects_user_id_created_at_idx" ON "projects"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "project_photos_project_id_idx" ON "project_photos"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_rooms_project_id_key" ON "project_rooms"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "wizard_answers_project_id_question_key_key" ON "wizard_answers"("project_id", "question_key");

-- CreateIndex
CREATE INDEX "project_selections_project_id_idx" ON "project_selections"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_selections_project_id_version_key" ON "project_selections"("project_id", "version");

-- CreateIndex
CREATE INDEX "selection_items_selection_id_idx" ON "selection_items"("selection_id");

-- CreateIndex
CREATE INDEX "project_renders_project_id_kind_idx" ON "project_renders"("project_id", "kind");

-- CreateIndex
CREATE INDEX "corrections_project_id_idx" ON "corrections"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_categories_external_id_key" ON "catalog_categories"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_categories_slug_key" ON "catalog_categories"("slug");

-- CreateIndex
CREATE INDEX "catalog_models_category_id_idx" ON "catalog_models"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_models_category_id_name_key" ON "catalog_models"("category_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_variants_external_id_key" ON "catalog_variants"("external_id");

-- CreateIndex
CREATE INDEX "catalog_variants_model_id_idx" ON "catalog_variants"("model_id");

-- CreateIndex
CREATE INDEX "catalog_variants_is_active_idx" ON "catalog_variants"("is_active");

-- CreateIndex
CREATE INDEX "catalog_props_variant_id_idx" ON "catalog_props"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_bucket_key_key" ON "files"("bucket", "key");

-- CreateIndex
CREATE INDEX "ai_jobs_project_id_idx" ON "ai_jobs"("project_id");

-- CreateIndex
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");

-- CreateIndex
CREATE INDEX "ai_usage_project_id_idx" ON "ai_usage"("project_id");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_rooms" ADD CONSTRAINT "project_rooms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wizard_answers" ADD CONSTRAINT "wizard_answers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_selections" ADD CONSTRAINT "project_selections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_items" ADD CONSTRAINT "selection_items_selection_id_fkey" FOREIGN KEY ("selection_id") REFERENCES "project_selections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_items" ADD CONSTRAINT "selection_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_renders" ADD CONSTRAINT "project_renders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_renders" ADD CONSTRAINT "project_renders_selection_id_fkey" FOREIGN KEY ("selection_id") REFERENCES "project_selections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_renders" ADD CONSTRAINT "project_renders_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_render_id_fkey" FOREIGN KEY ("render_id") REFERENCES "project_renders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_models" ADD CONSTRAINT "catalog_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "catalog_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_props" ADD CONSTRAINT "catalog_props_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

