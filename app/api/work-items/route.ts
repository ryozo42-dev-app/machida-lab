import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type WorkItemType = "insurance" | "private";

type CategoryRow = {
  id: number;
  name: string;
  sort_order: number;
};

type SubCategoryRow = {
  id: number;
  category_id: number;
  name: string;
  sort_order: number;
};

type ItemMasterRow = {
  id: number;
  sub_category_id: number;
  name: string;
  sort_order: number;
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  const customerIdParam = searchParams.get("customer_id");
  const typeParam = searchParams.get("type");
  const categoryIdParam = searchParams.get("category_id");
  const subCategoryIdParam = searchParams.get("sub_category_id");

  const customerId = Number(customerIdParam);
  const categoryId = Number(categoryIdParam);
  const subCategoryId = Number(subCategoryIdParam);

  /*
   * ============================================================
   * customer_id
   * ============================================================
   */

  if (
    customerIdParam === null ||
    customerIdParam.trim() === "" ||
    !Number.isInteger(customerId) ||
    customerId <= 0
  ) {
    return NextResponse.json(
      { error: "customer_id is required" },
      { status: 400 }
    );
  }

  /*
   * ============================================================
   * type
   * ============================================================
   */

  if (typeParam !== "insurance" && typeParam !== "private") {
    return NextResponse.json(
      { error: "type must be insurance or private" },
      { status: 400 }
    );
  }

  const type = typeParam as WorkItemType;

  try {
    /*
     * ============================================================
     * 医院の存在確認
     * ============================================================
     */

    const customer = await prisma.customers.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Invalid customer_id" },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 保険
     * ============================================================
     *
     * DB構造
     *
     * insurance_categories
     *        ↓
     * insurance_sub_categories.category_id
     *        ↓
     * insurance_item_masters.sub_category_id
     *
     */

    if (type === "insurance") {
      /*
       * ----------------------------------------------------------
       * ① 大分類
       * ----------------------------------------------------------
       *
       * category_id が指定されていない場合、
       * insurance_categories から大分類を取得する。
       */

      if (
        categoryIdParam === null ||
        categoryIdParam.trim() === ""
      ) {
        const categories =
          await prisma.$queryRaw<CategoryRow[]>`
            SELECT
              id,
              name,
              sort_order
            FROM insurance_categories
            WHERE is_active = true
            ORDER BY sort_order ASC, id ASC
          `;

        return NextResponse.json(
          categories.map((category) => ({
            id: category.id,
            name: category.name,
            type,
            level: "category",
          }))
        );
      }

      /*
       * category_id の確認
       */

      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid category_id" },
          { status: 400 }
        );
      }

      /*
       * ----------------------------------------------------------
       * ② 中分類
       * ----------------------------------------------------------
       *
       * 選択された大分類の id
       *
       *        ↓
       *
       * insurance_sub_categories.category_id
       *
       */

      if (
        subCategoryIdParam === null ||
        subCategoryIdParam.trim() === ""
      ) {
        const subCategories =
          await prisma.$queryRaw<SubCategoryRow[]>`
            SELECT
              id,
              category_id,
              name,
              sort_order
            FROM insurance_sub_categories
            WHERE
              category_id = ${categoryId}
              AND is_active = true
            ORDER BY sort_order ASC, id ASC
          `;

        return NextResponse.json(
          subCategories.map((subCategory) => ({
            id: subCategory.id,
            category_id: subCategory.category_id,
            name: subCategory.name,
            type,
            level: "sub_category",
          }))
        );
      }

      /*
       * sub_category_id の確認
       */

      if (
        !Number.isInteger(subCategoryId) ||
        subCategoryId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid sub_category_id" },
          { status: 400 }
        );
      }

      /*
       * ----------------------------------------------------------
       * ③ 小分類
       * ----------------------------------------------------------
       *
       * 選択された中分類の id
       *
       *        ↓
       *
       * insurance_item_masters.sub_category_id
       *
       */

      const itemMasters =
        await prisma.$queryRaw<ItemMasterRow[]>`
          SELECT
            id,
            sub_category_id,
            name,
            sort_order
          FROM insurance_item_masters
          WHERE
            sub_category_id = ${subCategoryId}
            AND is_active = true
          ORDER BY sort_order ASC, id ASC
        `;

      return NextResponse.json(
        itemMasters.map((item) => ({
          id: item.id,
          sub_category_id: item.sub_category_id,
          name: item.name,

          /*
           * 既存のコードとの互換性用。
           *
           * 今回の正式な小分類名称は name。
           */
          item_name: item.name,

          type,
          level: "item",
        }))
      );
    }

    /*
     * ============================================================
     * 自費
     * ============================================================
     *
     * 現時点では自費用DBが存在しないため、
     * 空配列を返す。
     *
     * 自費DB完成後にここを実装する。
     */

    if (type === "private") {
      return NextResponse.json([]);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error("Failed to fetch work item data", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}