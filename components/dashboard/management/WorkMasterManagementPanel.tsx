"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type WorkItemType = "insurance" | "private";
type MasterLevel = "category" | "sub_category" | "item";

type MasterRow = {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type CategoryRow = MasterRow & {
  level: "category";
};

type SubCategoryRow = MasterRow & {
  category_id: number;
  level: "sub_category";
};

type ItemRow = MasterRow & {
  sub_category_id: number;
  item_name: string;
  level: "item";
};

type Customer = {
  id: number;
  name: string;
};

type EditTarget =
  | { mode: "create"; level: MasterLevel }
  | { mode: "edit"; level: MasterLevel; item: MasterRow };

type PriceModalMode = "create" | "edit";

type WorkMasterManagementPanelProps = {
  onBack: () => void;
};

async function readApiError(response: Response, fallback: string) {
  try {
    const result = (await response.json()) as { error?: string };

    return result.error || fallback;
  } catch {
    return fallback;
  }
}

function masterEndpoint(level: MasterLevel) {
  if (level === "category") return "/api/work-item-masters/categories";
  if (level === "sub_category") return "/api/work-item-masters/sub-categories";
  return "/api/work-item-masters/items";
}

function masterLabel(level: MasterLevel) {
  if (level === "category") return "大分類";
  if (level === "sub_category") return "中分類";
  return "小分類";
}

export default function WorkMasterManagementPanel({
  onBack,
}: WorkMasterManagementPanelProps) {
  const [type, setType] = useState<WorkItemType>("insurance");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategoryRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedPriceCustomerId, setSelectedPriceCustomerId] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceModalMode, setPriceModalMode] = useState<PriceModalMode | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [isDeletePriceModalOpen, setIsDeletePriceModalOpen] = useState(false);
  const [deletePriceError, setDeletePriceError] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editName, setEditName] = useState("");
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );
  const selectedSubCategory = useMemo(
    () =>
      subCategories.find((subCategory) => subCategory.id === selectedSubCategoryId) ??
      null,
    [subCategories, selectedSubCategoryId]
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );
  const selectedPriceCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === selectedPriceCustomerId) ??
      null,
    [customers, selectedPriceCustomerId]
  );

  const loadCategories = useCallback(
    async (nextSelectedId?: number | null) => {
      const response = await fetch(
        `/api/work-item-masters/categories?type=${type}`
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "大分類の読み込みに失敗しました")
        );
      }

      const data = (await response.json()) as CategoryRow[];
      setCategories(data);
      setSelectedCategoryId(nextSelectedId ?? null);
    },
    [type]
  );

  const loadSubCategories = useCallback(
    async (categoryId: number, nextSelectedId?: number | null) => {
      const response = await fetch(
        `/api/work-item-masters/sub-categories?type=${type}&category_id=${categoryId}`
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "中分類の読み込みに失敗しました")
        );
      }

      const data = (await response.json()) as SubCategoryRow[];
      setSubCategories(data);
      setSelectedSubCategoryId(nextSelectedId ?? null);
    },
    [type]
  );

  const loadItems = useCallback(
    async (subCategoryId: number, nextSelectedId?: number | null) => {
      const response = await fetch(
        `/api/work-item-masters/items?type=${type}&sub_category_id=${subCategoryId}`
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "小分類の読み込みに失敗しました")
        );
      }

      const data = (await response.json()) as ItemRow[];
      setItems(data);
      setSelectedItemId(nextSelectedId ?? null);
    },
    [type]
  );

  useEffect(() => {
    let ignore = false;

    const loadInitial = async () => {
      setIsLoading(true);
      setError("");
      setCategories([]);
      setSubCategories([]);
      setItems([]);
      setSelectedCategoryId(null);
      setSelectedSubCategoryId(null);
      setSelectedItemId(null);

      try {
        const [categoryResponse, customerResponse] = await Promise.all([
          fetch(`/api/work-item-masters/categories?type=${type}`),
          fetch("/api/customers"),
        ]);

        if (!categoryResponse.ok) {
          throw new Error(
            await readApiError(categoryResponse, "大分類の読み込みに失敗しました")
          );
        }

        if (!customerResponse.ok) {
          throw new Error(
            await readApiError(customerResponse, "医院の読み込みに失敗しました")
          );
        }

        const categoryData = (await categoryResponse.json()) as CategoryRow[];
        const customerData = (await customerResponse.json()) as Customer[];

        if (ignore) return;

        setCategories(categoryData);
        setCustomers(customerData);
        setSelectedCategoryId(null);
      } catch (error) {
        if (ignore) return;
        console.error("Failed to load work master data", error);
        setError(
          error instanceof Error
            ? error.message
            : "作業マスターの読み込みに失敗しました"
        );
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    void loadInitial();

    return () => {
      ignore = true;
    };
  }, [type]);

  useEffect(() => {
    if (selectedCategoryId === null) {
      setSubCategories([]);
      setItems([]);
      setSelectedSubCategoryId(null);
      setSelectedItemId(null);
      setSelectedPriceCustomerId(null);
      setCurrentPrice(null);
      return;
    }

    void loadSubCategories(selectedCategoryId).catch((error) => {
      console.error("Failed to load sub categories", error);
      setError(
        error instanceof Error ? error.message : "中分類の読み込みに失敗しました"
      );
      setSubCategories([]);
      setItems([]);
      setSelectedSubCategoryId(null);
      setSelectedItemId(null);
      setSelectedPriceCustomerId(null);
      setCurrentPrice(null);
    });
  }, [loadSubCategories, selectedCategoryId]);

  useEffect(() => {
    if (selectedSubCategoryId === null) {
      setItems([]);
      setSelectedItemId(null);
      setSelectedPriceCustomerId(null);
      setCurrentPrice(null);
      return;
    }

    void loadItems(selectedSubCategoryId).catch((error) => {
      console.error("Failed to load items", error);
      setError(
        error instanceof Error ? error.message : "小分類の読み込みに失敗しました"
      );
      setItems([]);
      setSelectedItemId(null);
      setSelectedPriceCustomerId(null);
      setCurrentPrice(null);
    });
  }, [loadItems, selectedSubCategoryId]);

  const loadSelectedPrice = useCallback(async () => {
    if (selectedItemId === null || selectedPriceCustomerId === null) {
      setCurrentPrice(null);
      return;
    }

    setIsPriceLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/customer-prices?customer_id=${selectedPriceCustomerId}&type=${type}&item_id=${selectedItemId}`
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "医院別価格の読み込みに失敗しました")
        );
      }

      const data = (await response.json()) as { price: number | null };
      setCurrentPrice(data.price);
    } catch (error) {
      console.error("Failed to load prices", error);
      setError(
        error instanceof Error
          ? error.message
          : "医院別価格の読み込みに失敗しました"
      );
    } finally {
      setIsPriceLoading(false);
    }
  }, [selectedItemId, selectedPriceCustomerId, type]);

  useEffect(() => {
    void loadSelectedPrice();
  }, [loadSelectedPrice]);

  const resetType = (nextType: WorkItemType) => {
    setType(nextType);
    setError("");
    setSelectedPriceCustomerId(null);
    setCurrentPrice(null);
    setPriceModalMode(null);
    setPriceDraft("");
    setIsDeletePriceModalOpen(false);
    setDeletePriceError("");
    setEditTarget(null);
  };

  const openCreateModal = (level: MasterLevel) => {
    setEditTarget({ mode: "create", level });
    setEditName("");
    setError("");
  };

  const openEditModal = (level: MasterLevel, item: MasterRow) => {
    setEditTarget({ mode: "edit", level, item });
    setEditName(item.name);
    setError("");
  };

  const closeEditModal = () => {
    if (isSavingMaster) return;
    setEditTarget(null);
    setEditName("");
  };

  const saveMaster = async () => {
    if (editTarget === null || isSavingMaster) return;

    const name = editName.trim();
    if (name.length === 0) {
      setError("名称を入力してください");
      return;
    }

    setIsSavingMaster(true);
    setError("");

    try {
      const body =
        editTarget.level === "category"
          ? { type, name }
          : editTarget.level === "sub_category"
            ? { type, category_id: selectedCategoryId, name }
            : { type, sub_category_id: selectedSubCategoryId, name };

      const response = await fetch(
        editTarget.mode === "create"
          ? masterEndpoint(editTarget.level)
          : `${masterEndpoint(editTarget.level)}/${editTarget.item.id}`,
        {
          method: editTarget.mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editTarget.mode === "create" ? body : { type, name }
          ),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "作業マスターの保存に失敗しました")
        );
      }

      const created = (await response.json()) as MasterRow;
      const nextSelectedId =
        editTarget.mode === "create" ? created.id : editTarget.item.id;

      if (editTarget.level === "category") {
        await loadCategories(nextSelectedId);
      } else if (editTarget.level === "sub_category" && selectedCategoryId !== null) {
        await loadSubCategories(selectedCategoryId, nextSelectedId);
      } else if (editTarget.level === "item" && selectedSubCategoryId !== null) {
        await loadItems(selectedSubCategoryId, nextSelectedId);
      }

      setEditTarget(null);
      setEditName("");
    } catch (error) {
      console.error("Failed to save work master", error);
      setError(
        error instanceof Error ? error.message : "作業マスターの保存に失敗しました"
      );
    } finally {
      setIsSavingMaster(false);
    }
  };

  const toggleActive = async (level: MasterLevel, item: MasterRow) => {
    setError("");

    try {
      const response = await fetch(`${masterEndpoint(level)}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, is_active: !item.is_active }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "表示状態の更新に失敗しました")
        );
      }

      if (level === "category") {
        await loadCategories(selectedCategoryId);
      } else if (level === "sub_category" && selectedCategoryId !== null) {
        await loadSubCategories(selectedCategoryId, selectedSubCategoryId);
      } else if (level === "item" && selectedSubCategoryId !== null) {
        await loadItems(selectedSubCategoryId, selectedItemId);
      }
    } catch (error) {
      console.error("Failed to toggle work master", error);
      setError(
        error instanceof Error ? error.message : "表示状態の更新に失敗しました"
      );
    }
  };

  const openPriceModal = (mode: PriceModalMode) => {
    if (selectedPriceCustomerId === null) {
      setError("医院を選択してください");
      return;
    }

    setPriceModalMode(mode);
    setPriceDraft(mode === "edit" && currentPrice !== null ? String(currentPrice) : "");
    setError("");
  };

  const closePriceModal = () => {
    if (isSavingPrice) return;
    setPriceModalMode(null);
    setPriceDraft("");
  };

  const openDeletePriceModal = () => {
    if (selectedItemId === null || selectedPriceCustomerId === null || currentPrice === null) {
      return;
    }

    setIsDeletePriceModalOpen(true);
    setDeletePriceError("");
    setError("");
  };

  const closeDeletePriceModal = () => {
    if (isSavingPrice) return;
    setIsDeletePriceModalOpen(false);
    setDeletePriceError("");
  };

  const savePrice = async () => {
    if (
      selectedItemId === null ||
      selectedPriceCustomerId === null ||
      priceModalMode === null ||
      isSavingPrice
    ) {
      return;
    }

    const draft = priceDraft.trim();
    const price = Number(draft);

    if (!Number.isInteger(price) || price < 0) {
      setError("価格は0以上の整数で入力してください");
      return;
    }

    setIsSavingPrice(true);
    setError("");

    try {
      const response = await fetch("/api/customer-prices", {
        method: priceModalMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: selectedPriceCustomerId,
          type,
          item_id: selectedItemId,
          price,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "医院別価格の保存に失敗しました")
        );
      }

      setPriceModalMode(null);
      setPriceDraft("");
      await loadSelectedPrice();
    } catch (error) {
      console.error("Failed to save customer price", error);
      setError(
        error instanceof Error ? error.message : "医院別価格の保存に失敗しました"
      );
    } finally {
      setIsSavingPrice(false);
    }
  };

  const deletePrice = async () => {
    if (
      selectedItemId === null ||
      selectedPriceCustomerId === null ||
      currentPrice === null ||
      isSavingPrice
    ) {
      return;
    }

    setIsSavingPrice(true);
    setDeletePriceError("");

    try {
      const response = await fetch("/api/customer-prices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: selectedPriceCustomerId,
          type,
          item_id: selectedItemId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "医院別価格の削除に失敗しました")
        );
      }

      setCurrentPrice(null);
      setIsDeletePriceModalOpen(false);
      setDeletePriceError("");
    } catch (error) {
      console.error("Failed to delete customer price", error);
      setDeletePriceError(
        error instanceof Error ? error.message : "医院別価格の削除に失敗しました"
      );
    } finally {
      setIsSavingPrice(false);
    }
  };

  const renderMasterSelect = (
    level: MasterLevel,
    rows: MasterRow[],
    selectedId: number | null,
    onSelect: (id: number) => void,
    canCreate: boolean
  ) => {
    const selected = rows.find((row) => row.id === selectedId) ?? null;
    const addOptionValue = `__add_${level}`;

    return (
      <div className="rounded-[16px] border border-[#E8E8E8] bg-white p-3">
        <p className="text-sm font-bold text-[#222222]">{masterLabel(level)}</p>

        <div className="mt-3 flex h-10 items-center gap-2">
          <select
            value={selectedId ?? ""}
            onChange={(event) => {
              if (event.target.value === addOptionValue) {
                openCreateModal(level);
                return;
              }

              if (event.target.value === "") {
                return;
              }

              onSelect(Number(event.target.value));
            }}
            disabled={!canCreate}
            className="h-10 min-w-0 flex-1 rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132] disabled:bg-[#FAFAFA] disabled:text-[#999999]"
          >
            <option value="">{masterLabel(level)}を選択</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.is_active ? "" : "（非表示）"}
              </option>
            ))}
            {canCreate ? (
              <option value={addOptionValue}>＋ {masterLabel(level)}を追加</option>
            ) : null}
          </select>

          <button
            type="button"
            onClick={() => {
              if (selected) {
                openEditModal(level, selected);
              }
            }}
            disabled={!selected}
            className="h-10 shrink-0 rounded-lg border border-[#E1E1E1] bg-white px-3 text-xs font-semibold text-[#555555] hover:bg-[#FFF8EA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            編集
          </button>

          <label className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#E1E1E1] bg-white px-2.5 text-xs font-semibold text-[#555555]">
            <input
              type="checkbox"
              checked={Boolean(selected?.is_active)}
              onChange={() => {
                if (selected) {
                  void toggleActive(level, selected);
                }
              }}
              disabled={!selected}
              className="h-3.5 w-3.5 accent-[#fff362] disabled:opacity-50"
            />
            表示
          </label>
        </div>
      </div>
    );
  };

  return (
    <>
      <section
        className="flex h-full min-h-[340px] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-white p-6"
        aria-label="作業マスター管理"
      >
        <div
          className="h-[14px] w-full rounded-t-[20px] bg-[#fff362]"
          aria-hidden="true"
        />

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 h-10 w-[5px] rounded-full bg-[#fff362]"
              aria-hidden="true"
            />

            <div>
              <h2 className="text-2xl font-bold text-[#222222]">
                作業マスター管理
              </h2>

              <p className="mt-1 text-xs text-[#666666]">
                作業分類・医院別価格を管理します
              </p>
            </div>
          </div>

          <div className="flex rounded-lg border border-[#E2E2E2] bg-white p-1">
            {[
              ["insurance", "保険"],
              ["private", "自費"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => resetType(value as WorkItemType)}
                className={`rounded-md px-4 py-1.5 text-sm font-bold ${
                  type === value
                    ? "bg-[#fff362] text-[#222222]"
                    : "text-[#555555] hover:bg-[#FFF8EA]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-[#F4C7C7] bg-[#FFF3F3] px-4 py-3 text-sm text-[#A63C3C]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-3 gap-3 rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
          {isLoading ? (
            <div className="col-span-3 flex min-h-[240px] items-center justify-center">
              <p className="text-sm text-[#666666]">読み込み中...</p>
            </div>
          ) : (
            <>
              {renderMasterSelect("category", categories, selectedCategoryId, (id) => {
                setSelectedCategoryId(id);
                setSelectedSubCategoryId(null);
                setSelectedItemId(null);
                setSelectedPriceCustomerId(null);
                setCurrentPrice(null);
              }, true)}
              {renderMasterSelect("sub_category", subCategories, selectedSubCategoryId, (id) => {
                setSelectedSubCategoryId(id);
                setSelectedItemId(null);
                setSelectedPriceCustomerId(null);
                setCurrentPrice(null);
              }, selectedCategoryId !== null)}
              {renderMasterSelect("item", items, selectedItemId, (id) => {
                setSelectedItemId(id);
                setSelectedPriceCustomerId(null);
                setCurrentPrice(null);
              }, selectedSubCategoryId !== null)}
            </>
          )}
        </div>

        <div className="mt-3 rounded-[16px] border border-[#E8E8E8] bg-[#FCFCFC] p-4">
          <div>
            <p className="text-sm font-bold text-[#222222]">医院別価格</p>
            <p className="mt-1 text-xs text-[#777777]">
              {selectedItem
                ? `${selectedSubCategory?.name ?? ""} ${selectedItem.name}`.trim()
                : "小分類を選択してください"}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
            <select
              value={selectedPriceCustomerId ?? ""}
              onChange={(event) => {
                const nextCustomerId =
                  event.target.value === "" ? null : Number(event.target.value);
                setSelectedPriceCustomerId(nextCustomerId);
                setCurrentPrice(null);
              }}
              disabled={!selectedItem}
              className="h-10 rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132] disabled:bg-[#FAFAFA] disabled:text-[#999999]"
            >
              <option value="">医院を選択</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>

            <div className="rounded-xl border border-[#E8E8E8] bg-white px-3 py-2">
              {selectedItem === null ? (
                <div className="flex min-h-[42px] items-center">
                  <p className="text-sm text-[#777777]">小分類を選択してください</p>
                </div>
              ) : selectedPriceCustomer ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[#666666]">
                      現在価格：
                      {isPriceLoading
                        ? "読み込み中..."
                        : currentPrice === null
                          ? "未登録"
                          : `¥${currentPrice.toLocaleString("ja-JP")}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    {currentPrice === null ? (
                      <button
                        type="button"
                        onClick={() => openPriceModal("create")}
                        disabled={isPriceLoading || isSavingPrice}
                        className="rounded-md bg-[#fff362] px-3 py-1.5 text-xs font-bold text-[#222222] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        登録
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openPriceModal("edit")}
                          disabled={isPriceLoading || isSavingPrice}
                          className="rounded-md bg-[#fff362] px-3 py-1.5 text-xs font-bold text-[#222222] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={openDeletePriceModal}
                          disabled={isPriceLoading || isSavingPrice}
                          className="rounded-md border border-[#E1E1E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#555555] hover:bg-[#FFF8EA] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[42px] items-center">
                  <p className="text-sm text-[#777777]">現在価格：-</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end border-t border-[#ECECEC] pt-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-[#fff362] bg-[#fff362] px-5 py-2 text-sm font-semibold text-[#222222] hover:bg-[#fff362]"
          >
            管理メニューに戻る
          </button>
        </div>
      </section>

      {isDeletePriceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="w-full max-w-sm overflow-hidden rounded-[18px] border border-[#E9E9E9] bg-white shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
            <div className="h-[8px] w-full bg-[#fff362]" aria-hidden="true" />
            <div className="px-6 py-6">
              <h3 className="text-lg font-bold text-[#1F1F1F]">
              医院別価格を削除しますか？
              </h3>

              <div className="mt-4 rounded-xl border border-[#E8E8E8] bg-[#FCFCFC] px-3 py-3">
                <p className="text-sm font-semibold text-[#222222]">
                  {selectedPriceCustomer?.name ?? ""}
                </p>
                <p className="mt-1 text-xs text-[#666666]">
                  {`${selectedSubCategory?.name ?? ""} / ${selectedItem?.name ?? ""}`.trim()}
                </p>
                <p className="mt-3 text-sm text-[#555555]">
                  この医院別価格を削除すると、単価未登録になります。
                </p>
              </div>

              {deletePriceError ? (
                <p className="mt-3 rounded-lg border border-[#F4C7C7] bg-[#FFF3F3] px-3 py-2 text-sm text-[#A63C3C]">
                  {deletePriceError}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeletePriceModal}
                  disabled={isSavingPrice}
                  className="rounded-lg border border-[#E1E1E1] bg-white px-4 py-2 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deletePrice();
                  }}
                  disabled={isSavingPrice}
                  className="rounded-lg bg-[#B42318] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#971D13] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingPrice ? "削除中..." : "削除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {priceModalMode !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-[18px] border border-[#E9E9E9] bg-white px-6 py-6 shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
            <h3 className="text-lg font-bold text-[#1F1F1F]">
              医院別価格を{priceModalMode === "create" ? "登録" : "編集"}
            </h3>

            <p className="mt-2 text-xs text-[#666666]">
              {selectedPriceCustomer?.name ?? ""}
            </p>

            <input
              type="number"
              min="0"
              step="1"
              value={priceDraft}
              onChange={(event) => setPriceDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void savePrice();
                }
              }}
              placeholder="価格を入力"
              className="mt-4 h-10 w-full rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closePriceModal}
                disabled={isSavingPrice}
                className="rounded-lg border border-[#E1E1E1] bg-white px-4 py-2 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  void savePrice();
                }}
                disabled={isSavingPrice}
                className="rounded-lg bg-[#fff362] px-5 py-2 text-sm font-bold text-[#222222] transition-colors hover:bg-[#f4e64f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingPrice ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-[18px] border border-[#E9E9E9] bg-white px-6 py-6 shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
            <h3 className="text-lg font-bold text-[#1F1F1F]">
              {masterLabel(editTarget.level)}
              {editTarget.mode === "create" ? "を追加" : "を編集"}
            </h3>

            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                }
              }}
              placeholder="名称を入力"
              className="mt-4 h-10 w-full rounded-lg border border-[#E2E2E2] bg-white px-3 text-sm font-medium text-[#333333] outline-none transition-colors focus:border-[#F0B132]"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSavingMaster}
                className="rounded-lg border border-[#E1E1E1] bg-white px-4 py-2 text-sm font-semibold text-[#444444] transition-colors hover:bg-[#F8F8F8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveMaster();
                }}
                disabled={isSavingMaster}
                className="rounded-lg bg-[#fff362] px-5 py-2 text-sm font-bold text-[#222222] transition-colors hover:bg-[#f4e64f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingMaster ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
