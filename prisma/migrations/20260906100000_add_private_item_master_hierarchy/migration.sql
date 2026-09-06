CREATE TABLE "private_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "private_sub_categories" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_sub_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "private_item_masters" (
    "id" SERIAL NOT NULL,
    "sub_category_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_item_masters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "private_categories_name_key" ON "private_categories"("name");

CREATE UNIQUE INDEX "uq_private_sub_categories" ON "private_sub_categories"("category_id", "name");

CREATE UNIQUE INDEX "uq_private_item_masters" ON "private_item_masters"("sub_category_id", "name");

ALTER TABLE "private_sub_categories" ADD CONSTRAINT "fk_private_sub_categories_category" FOREIGN KEY ("category_id") REFERENCES "private_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "private_item_masters" ADD CONSTRAINT "fk_private_item_masters_sub_category" FOREIGN KEY ("sub_category_id") REFERENCES "private_sub_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO "private_categories" ("name", "sort_order")
VALUES
    ('クラウン・ブリッジ', 1),
    ('メタルボンド', 2),
    ('オールセラミック', 3);

INSERT INTO "private_sub_categories" ("category_id", "name", "sort_order")
SELECT
    pc."id",
    source."name",
    source."sort_order"
FROM (
    VALUES
        ('クラウン・ブリッジ', 'G', 1),
        ('クラウン・ブリッジ', 'Ni-Cr', 2),
        ('クラウン・ブリッジ', 'Co-Cr', 3),
        ('クラウン・ブリッジ', 'ハイブリッドレジン', 4),
        ('クラウン・ブリッジ', 'その他', 5),
        ('メタルボンド', 'メタルボンド', 1),
        ('メタルボンド', 'Co-Cr', 2),
        ('メタルボンド', 'その他', 3),
        ('オールセラミック', 'オールセラミック', 1),
        ('オールセラミック', 'ジルコニア', 2),
        ('オールセラミック', 'その他', 3)
) AS source("category_name", "name", "sort_order")
JOIN "private_categories" pc
    ON pc."name" = source."category_name";

INSERT INTO "private_item_masters" ("sub_category_id", "name", "sort_order")
SELECT
    psc."id",
    source."name",
    source."sort_order"
FROM (
    VALUES
        ('クラウン・ブリッジ', 'G', 'インレー（単純）', 1),
        ('クラウン・ブリッジ', 'G', 'インレー（複雑）', 2),
        ('クラウン・ブリッジ', 'G', 'インレー（MOD）', 3),
        ('クラウン・ブリッジ', 'G', 'オンレー', 4),
        ('クラウン・ブリッジ', 'G', 'FMC', 5),
        ('クラウン・ブリッジ', 'G', '4/5・3/4冠', 6),
        ('クラウン・ブリッジ', 'G', 'メタルダミー（小臼歯）', 7),
        ('クラウン・ブリッジ', 'G', 'メタルダミー（大臼歯）', 8),
        ('クラウン・ブリッジ', 'G', 'メタルスペース', 9),
        ('クラウン・ブリッジ', 'G', 'メタルスペース（L）', 10),
        ('クラウン・ブリッジ', 'Ni-Cr', 'インレー（単純）', 1),
        ('クラウン・ブリッジ', 'Ni-Cr', 'インレー（複雑）', 2),
        ('クラウン・ブリッジ', 'Ni-Cr', 'インレー（MOD）', 3),
        ('クラウン・ブリッジ', 'Ni-Cr', 'オンレー', 4),
        ('クラウン・ブリッジ', 'Ni-Cr', 'FMC', 5),
        ('クラウン・ブリッジ', 'Ni-Cr', '4/5・3/4冠', 6),
        ('クラウン・ブリッジ', 'Ni-Cr', 'メタルダミー（小臼歯）', 7),
        ('クラウン・ブリッジ', 'Ni-Cr', 'メタルダミー（大臼歯）', 8),
        ('クラウン・ブリッジ', 'Ni-Cr', 'メタルスペース', 9),
        ('クラウン・ブリッジ', 'Ni-Cr', 'メタルスペース（L）', 10),
        ('クラウン・ブリッジ', 'Co-Cr', 'インレー（単純）', 1),
        ('クラウン・ブリッジ', 'Co-Cr', 'インレー（複雑）', 2),
        ('クラウン・ブリッジ', 'Co-Cr', 'インレー（MOD）', 3),
        ('クラウン・ブリッジ', 'Co-Cr', 'オンレー', 4),
        ('クラウン・ブリッジ', 'Co-Cr', 'FMC', 5),
        ('クラウン・ブリッジ', 'Co-Cr', '4/5・3/4冠', 6),
        ('クラウン・ブリッジ', 'Co-Cr', 'メタルダミー（小臼歯）', 7),
        ('クラウン・ブリッジ', 'Co-Cr', 'メタルダミー（大臼歯）', 8),
        ('クラウン・ブリッジ', 'Co-Cr', 'メタルスペース', 9),
        ('クラウン・ブリッジ', 'Co-Cr', 'メタルスペース（L）', 10),
        ('クラウン・ブリッジ', 'ハイブリッドレジン', 'インレー（単純）', 1),
        ('クラウン・ブリッジ', 'ハイブリッドレジン', 'インレー（複雑）', 2),
        ('クラウン・ブリッジ', 'ハイブリッドレジン', '前装冠', 3),
        ('クラウン・ブリッジ', 'ハイブリッドレジン', '前装冠スペース', 4),
        ('クラウン・ブリッジ', 'その他', 'ファイバーコア', 1),
        ('クラウン・ブリッジ', 'その他', 'ファイバーコア（複雑）', 2),
        ('クラウン・ブリッジ', 'その他', 'ロー着', 3),
        ('クラウン・ブリッジ', 'その他', 'TEK', 4),
        ('メタルボンド', 'メタルボンド', 'ベニア', 1),
        ('メタルボンド', 'メタルボンド', 'フルカバー', 2),
        ('メタルボンド', 'メタルボンド', 'カラーレス1歯あたり', 3),
        ('メタルボンド', 'メタルボンド', 'スペース', 4),
        ('メタルボンド', 'Co-Cr', 'ベニア', 1),
        ('メタルボンド', 'Co-Cr', 'フルカバー', 2),
        ('メタルボンド', 'その他', 'ロー着', 1),
        ('メタルボンド', 'その他', 'TEK', 2),
        ('オールセラミック', 'オールセラミック', '冠（e-max）', 1),
        ('オールセラミック', 'オールセラミック', 'インレー', 2),
        ('オールセラミック', 'オールセラミック', '4/5・3/4冠', 3),
        ('オールセラミック', 'オールセラミック', 'レジンコーピング試適', 4),
        ('オールセラミック', 'ジルコニア', '冠', 1),
        ('オールセラミック', 'ジルコニア', 'インレー', 2),
        ('オールセラミック', 'ジルコニア', 'クラウン', 3),
        ('オールセラミック', 'その他', 'ロー着', 1),
        ('オールセラミック', 'その他', 'TEK', 2)
) AS source("category_name", "sub_category_name", "name", "sort_order")
JOIN "private_categories" pc
    ON pc."name" = source."category_name"
JOIN "private_sub_categories" psc
    ON psc."category_id" = pc."id"
    AND psc."name" = source."sub_category_name";
