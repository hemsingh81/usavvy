CREATE TABLE "concept_prerequisites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"concept_id" uuid NOT NULL,
	"prerequisite_concept_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"objectives" text[],
	"source_material_refs" text[],
	"board_asset_refs" text[],
	"checkpoint_questions" jsonb,
	"difficulty_tier" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_prerequisite_concept_id_concepts_id_fk" FOREIGN KEY ("prerequisite_concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;