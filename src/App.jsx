import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calculator,
  ChefHat,
  ClipboardList,
  Database,
  LineChart as LineChartIcon,
  Loader2,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { demoData } from "./lib/demoData";
import { baseQuantity, money, unitLabel } from "./lib/format";
import { mapIngredient, mapPurchase, mapRecipe, mapRecipeCost, mapSettings } from "./lib/mappers";
import { supabase } from "./lib/supabase";

const emptyState = {
  settings: { hourlyRate: 0, utilities: 0, otherCosts: 0, margin: 0 },
  ingredients: [],
  purchases: [],
  recipes: [],
  recipeCosts: [],
  adminUsers: [],
  adminDetail: null
};

const views = [
  ["dashboard", "Resumen", BarChart3],
  ["purchases", "Compras", ShoppingBag],
  ["ingredients", "Ingredientes", Package],
  ["recipes", "Recetas", ClipboardList],
  ["costing", "Costeo", Calculator],
  ["settings", "Costos fijos", Settings2]
];

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function ingredientByName(ingredients, name) {
  return ingredients.find((item) => item.name.toLowerCase() === name.toLowerCase());
}

function latestUnitCost(ingredients, purchases, ingredientId) {
  const ingredient = ingredients.find((item) => item.id === ingredientId);
  if (Number(ingredient?.latestUnitPrice) > 0) return Number(ingredient.latestUnitPrice);

  const latest = purchases
    .filter((purchase) => purchase.ingredientId === ingredientId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  return latest ? Number(latest.unitPrice) : 0;
}

function recipeIngredientCost(recipe, ingredients, purchases, targetServings = recipe.servings) {
  const multiplier = Number(targetServings) / Number(recipe.servings);
  return recipe.items.reduce((total, item) => {
    const cost = latestUnitCost(ingredients, purchases, item.ingredientId);
    return total + cost * baseQuantity(item.quantity, item.unit) * multiplier;
  }, 0);
}

function Field({ children, label }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function Panel({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function SectionHeader({ title, copy, action }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="section-title">{title}</h2>
        {copy && <p className="section-copy">{copy}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, copy, icon: Icon = Database }) {
  return (
    <div className="empty-state">
      <Icon className="mx-auto mb-3 h-8 w-8 text-brand" strokeWidth={1.8} />
      <strong className="block text-ink">{title}</strong>
      {copy && <p className="mt-1">{copy}</p>}
    </div>
  );
}

function Spinner({ className = "h-4 w-4" }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

function Modal({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-panel">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="section-title">{title}</h2>
            <p className="section-copy">Completa los datos y guarda para actualizar el panel.</p>
          </div>
          <button className="btn-subtle" type="button" onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(emptyState);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [recipeLines, setRecipeLines] = useState([{ ingredientId: "", quantity: 100, unit: "g" }]);
  const [costInput, setCostInput] = useState({
    recipeId: "",
    targetServings: 10,
    laborHours: 3,
    hourlyRate: 0,
    utilities: 0,
    otherCosts: 0,
    margin: 0
  });
  const [costResult, setCostResult] = useState(null);

  const navItems = isAdmin ? [...views, ["admin", "Admin", ShieldCheck]] : views;
  const viewTitle = navItems.find(([key]) => key === view)?.[1] ?? "Resumen";

  const ingredientOptions = useMemo(() => data.ingredients, [data.ingredients]);
  const selectedRecipe = data.recipes.find((recipe) => recipe.id === costInput.recipeId) ?? data.recipes[0];

  const refresh = useCallback(async () => {
    const admin = await rpc("sp_is_admin");
    setIsAdmin(Boolean(admin));

    const currentSettings = await rpc("sp_get_settings");
    let settings = mapSettings(currentSettings);
    if (!currentSettings) {
      const saved = await rpc("sp_upsert_app_settings", {
        p_hourly_rate: demoData.settings.hourlyRate,
        p_utilities_cost: demoData.settings.utilities,
        p_other_cost: demoData.settings.otherCosts,
        p_target_margin: demoData.settings.margin
      });
      settings = mapSettings(saved);
    }

    const [ingredients, purchases, recipes, recipeCosts] = await Promise.all([
      rpc("sp_list_ingredients"),
      rpc("sp_list_purchases"),
      rpc("sp_list_recipes"),
      rpc("sp_recipe_cost_summary")
    ]);

    const nextData = {
      settings,
      ingredients: ingredients.map(mapIngredient),
      purchases: purchases.map(mapPurchase),
      recipes: recipes.map(mapRecipe),
      recipeCosts: recipeCosts.map(mapRecipeCost)
    };

    setData((current) => ({
      ...nextData,
      adminUsers: current.adminUsers,
      adminDetail: current.adminDetail
    }));
    const firstRecipe = nextData.recipes[0];
    setCostInput((current) => ({
      ...current,
      recipeId: current.recipeId || firstRecipe?.id || "",
      targetServings: current.targetServings || firstRecipe?.servings || 10,
      laborHours: current.laborHours || firstRecipe?.laborHours || 3,
      hourlyRate: settings.hourlyRate,
      utilities: settings.utilities,
      otherCosts: settings.otherCosts,
      margin: settings.margin
    }));
    setRecipeLines((current) =>
      current.map((line) => ({
        ...line,
        ingredientId: line.ingredientId || nextData.ingredients[0]?.id || "",
        unit: line.unit || nextData.ingredients[0]?.baseUnit || "g"
      }))
    );
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: authData }) => {
      setSession(authData.session);
      if (authData.session) {
        await refresh();
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setIsAdmin(false);
        setData(emptyState);
        setView("dashboard");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    async function calculate() {
      if (!selectedRecipe) {
        setCostResult(null);
        return;
      }

      const [result] = await rpc("sp_calculate_recipe_cost", {
        p_recipe_id: selectedRecipe.id,
        p_target_servings: Number(costInput.targetServings),
        p_labor_hours: Number(costInput.laborHours),
        p_hourly_rate: Number(costInput.hourlyRate),
        p_utilities_cost: Number(costInput.utilities),
        p_other_cost: Number(costInput.otherCosts),
        p_target_margin: Number(costInput.margin)
      });

      setCostResult(result ?? null);
    }

    if (session && selectedRecipe) {
      calculate().catch((error) => alert(error.message));
    }
  }, [costInput, selectedRecipe, session]);

  async function handleAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mode = event.nativeEvent.submitter.value;
    const email = form.get("email");
    const password = form.get("password");

    setBusy(mode);
    setAuthMessage("");
    try {
      const response =
        mode === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin }
            })
          : await supabase.auth.signInWithPassword({ email, password });

      if (response.error) throw response.error;
      if (!response.data.session) {
        setAuthMessage("Cuenta creada. Revisa tu correo para confirmar el acceso.");
        return;
      }

      setSession(response.data.session);
      await refresh();
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function loadDemoData() {
    setBusy("demo");
    try {
      await rpc("sp_upsert_app_settings", {
        p_hourly_rate: demoData.settings.hourlyRate,
        p_utilities_cost: demoData.settings.utilities,
        p_other_cost: demoData.settings.otherCosts,
        p_target_margin: demoData.settings.margin
      });

      await refresh();
      let ingredients = (await rpc("sp_list_ingredients")).map(mapIngredient);
      for (const ingredient of demoData.ingredients) {
        if (!ingredientByName(ingredients, ingredient.name)) {
          await rpc("sp_save_ingredient", {
            p_name: ingredient.name,
            p_base_unit: ingredient.baseUnit
          });
        }
      }

      ingredients = (await rpc("sp_list_ingredients")).map(mapIngredient);
      for (const purchase of demoData.purchases) {
        const ingredient = ingredientByName(ingredients, purchase.ingredient);
        await rpc("sp_save_purchase", {
          p_ingredient_id: ingredient.id,
          p_purchase_date: purchase.date,
          p_quantity: purchase.quantity,
          p_unit: purchase.unit,
          p_total_price: purchase.price
        });
      }

      const recipes = (await rpc("sp_list_recipes")).map(mapRecipe);
      for (const recipe of demoData.recipes) {
        if (recipes.some((item) => item.name.toLowerCase() === recipe.name.toLowerCase())) continue;

        const savedRecipe = await rpc("sp_save_recipe", {
          p_name: recipe.name,
          p_servings: recipe.servings,
          p_labor_hours: recipe.laborHours
        });

        await rpc("sp_replace_recipe_ingredients", {
          p_recipe_id: savedRecipe.id,
          p_items: recipe.items.map((item) => ({
            ingredient_id: ingredientByName(ingredients, item.ingredient).id,
            quantity: item.quantity,
            unit: item.unit
          }))
        });
      }

      await refresh();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveIngredient(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("ingredient");
    try {
      await rpc("sp_save_ingredient", {
        p_name: form.get("name").trim(),
        p_base_unit: form.get("baseUnit")
      });
      event.currentTarget.reset();
      setModal(null);
      await refresh();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function savePurchase(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("purchase");
    try {
      await rpc("sp_save_purchase", {
        p_ingredient_id: form.get("ingredientId"),
        p_purchase_date: form.get("date"),
        p_quantity: Number(form.get("quantity")),
        p_unit: form.get("unit"),
        p_total_price: Number(form.get("price"))
      });
      event.currentTarget.reset();
      setModal(null);
      await refresh();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveRecipe(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("recipe");
    try {
      const recipe = await rpc("sp_save_recipe", {
        p_name: form.get("name").trim(),
        p_servings: Number(form.get("servings")),
        p_labor_hours: 0
      });
      await rpc("sp_replace_recipe_ingredients", {
        p_recipe_id: recipe.id,
        p_items: recipeLines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: Number(line.quantity),
          unit: line.unit
        }))
      });
      event.currentTarget.reset();
      setRecipeLines([{ ingredientId: data.ingredients[0]?.id || "", quantity: 100, unit: data.ingredients[0]?.baseUnit || "g" }]);
      setModal(null);
      await refresh();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("settings");
    try {
      await rpc("sp_upsert_app_settings", {
        p_hourly_rate: Number(form.get("hourlyRate")),
        p_utilities_cost: Number(form.get("utilities")),
        p_other_cost: Number(form.get("otherCosts")),
        p_target_margin: Number(form.get("margin"))
      });
      await refresh();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function loadAdminOverview() {
    setBusy("admin");
    try {
      const adminUsers = await rpc("sp_admin_overview");
      setData((current) => ({ ...current, adminUsers }));
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy("");
    }
  }

  async function loadAdminDetail(userId) {
    const adminDetail = await rpc("sp_admin_user_details", { p_user_id: userId });
    setData((current) => ({ ...current, adminDetail }));
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-sm">
          <Spinner />
          Cargando espacio de trabajo
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <form onSubmit={handleAuth} className="panel grid w-full max-w-md gap-5">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-blue-100 text-blue-800 shadow-sm">
            <ChefHat className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Bakery Cost Manager</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Gestiona compras, recetas y costos con una vista clara de tu operacion.</p>
          </div>
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Contrasena">
            <input name="password" type="password" autoComplete="current-password" minLength="6" required />
          </Field>
          <div className="flex gap-3">
            <button className="btn-primary flex-1" name="mode" value="signin" type="submit" disabled={busy === "signin"}>
              {busy === "signin" ? <><Spinner /> Entrando</> : <>Entrar</>}
            </button>
            <button className="btn-ghost flex-1" name="mode" value="signup" type="submit" disabled={busy === "signup"}>
              {busy === "signup" ? <><Spinner /> Creando</> : <>Crear cuenta</>}
            </button>
          </div>
          {authMessage && <p className="rounded-lg bg-[#f8fbff] px-3 py-2 text-sm text-muted">{authMessage}</p>}
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="bg-[#0f2a4a] p-5 text-white lg:sticky lg:top-0 lg:min-h-screen lg:p-6">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-100 text-blue-800 shadow-sm">
            <ChefHat className="h-6 w-6" />
          </span>
          <div>
            <strong className="block">Bakery Cost Manager</strong>
            <small className="text-blue-100/80">costos y recetas</small>
          </div>
        </div>
        <nav className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {navItems.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => {
                setView(key);
                if (key === "admin") loadAdminOverview();
              }}
              className={`nav-button ${view === key ? "nav-button-active" : "nav-button-idle"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-blue-100/80">
          <p className="font-semibold text-white">Sesion activa</p>
          <p className="mt-1 truncate">{session.user.email}</p>
        </div>
      </aside>

      <main className="min-w-0 p-5 lg:p-8">
        <header className="mb-7 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-black uppercase text-muted">Panel operativo</p>
            <h1 className="text-3xl font-black tracking-tight">{viewTitle}</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-ghost" onClick={loadDemoData} disabled={busy === "demo"}>
              {busy === "demo" ? <><Spinner /> Cargando</> : <><Sparkles className="h-4 w-4" /> Cargar demo</>}
            </button>
            <button className="btn-subtle" onClick={signOut}><LogOut className="h-4 w-4" /> Salir</button>
          </div>
        </header>

        {view === "dashboard" && <Dashboard data={data} />}
        {view === "purchases" && (
          <Purchases data={data} openModal={setModal} />
        )}
        {view === "ingredients" && <Ingredients data={data} openModal={setModal} />}
        {view === "recipes" && (
          <Recipes
            data={data}
            recipeLines={recipeLines}
            setRecipeLines={setRecipeLines}
            openModal={setModal}
          />
        )}
        {view === "costing" && (
          <Costing
            data={data}
            costInput={costInput}
            setCostInput={setCostInput}
            costResult={costResult}
          />
        )}
        {view === "settings" && <Settings data={data} saveSettings={saveSettings} busy={busy} />}
        {view === "admin" && isAdmin && (
          <Admin data={data} busy={busy} loadAdminOverview={loadAdminOverview} loadAdminDetail={loadAdminDetail} />
        )}

        {modal === "purchase" && (
          <Modal title="Nueva compra" onClose={() => setModal(null)}>
            <PurchaseForm ingredientOptions={ingredientOptions} savePurchase={savePurchase} busy={busy} />
          </Modal>
        )}
        {modal === "ingredient" && (
          <Modal title="Nuevo ingrediente" onClose={() => setModal(null)}>
            <IngredientForm saveIngredient={saveIngredient} busy={busy} />
          </Modal>
        )}
        {modal === "recipe" && (
          <Modal title="Nueva receta" onClose={() => setModal(null)}>
            <RecipeForm data={data} recipeLines={recipeLines} setRecipeLines={setRecipeLines} saveRecipe={saveRecipe} busy={busy} />
          </Modal>
        )}
      </main>
    </div>
  );
}

function Dashboard({ data }) {
  const mostExpensive = data.recipeCosts.length ? Math.max(...data.recipeCosts.map((recipe) => recipe.ingredientCost)) : 0;
  const recentPurchases = [...data.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const totalPurchases = data.purchases.reduce((sum, purchase) => sum + Number(purchase.price ?? 0), 0);
  const productHistory = data.ingredients.map((ingredient) => ({
    ingredient,
    purchases: data.purchases
      .filter((purchase) => purchase.ingredientId === ingredient.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((purchase) => ({
        date: purchase.date,
        price: Number(purchase.unitPrice),
        total: Number(purchase.price),
        label: `${purchase.quantity} ${unitLabel(purchase.unit)}`
      }))
  })).filter((item) => item.purchases.length);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Package} label="Ingredientes" value={data.ingredients.length} helper="catalogados" />
        <Metric icon={ClipboardList} label="Recetas" value={data.recipes.length} helper="activas" />
        <Metric icon={ShoppingBag} label="Compras" value={data.purchases.length} helper={money.format(totalPurchases)} />
        <Metric icon={Calculator} label="Mayor costo" value={money.format(mostExpensive)} helper="solo ingredientes" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <SectionHeader title="Ultimas compras" copy="Referencia rapida para detectar cambios de precio." />
          {recentPurchases.length ? (
            <Table headers={["Fecha", "Ingrediente", "Medida", "Precio unit."]}>
              {recentPurchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.date}</td>
                  <td><strong>{purchase.ingredientName}</strong></td>
                  <td>{purchase.quantity} {unitLabel(purchase.unit)}</td>
                  <td className="text-right font-semibold">{money.format(purchase.unitPrice)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState icon={ShoppingBag} title="Aun no hay compras" copy="Registra una compra para comenzar el historico de precios." />
          )}
        </Panel>
        <Panel>
          <SectionHeader title="Costos por receta" copy="Costo base calculado con el ultimo precio conocido." />
          <div className="grid gap-3">
            {data.recipeCosts.map((recipe) => (
              <div className="item flex justify-between gap-4" key={recipe.recipeId}>
                <div>
                  <strong>{recipe.recipeName}</strong>
                  <p className="text-sm text-muted">{recipe.servings} porciones, solo ingredientes</p>
                </div>
                <strong>{money.format(recipe.ingredientCost)}</strong>
              </div>
            ))}
            {!data.recipeCosts.length && <EmptyState icon={ClipboardList} title="Sin recetas costeadas" copy="Crea una receta con ingredientes para verla en este resumen." />}
          </div>
        </Panel>
      </div>
      <Panel>
        <SectionHeader
          title="Historico por producto"
          copy="Evolucion del precio unitario por ingrediente y fecha de compra."
          action={<span className="pill"><LineChartIcon className="h-3.5 w-3.5" /> {productHistory.length} productos</span>}
        />
        {productHistory.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {productHistory.map(({ ingredient, purchases }) => (
              <article className="item" key={ingredient.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <strong>{ingredient.name}</strong>
                    <p className="text-sm text-muted">{purchases.length} compra{purchases.length === 1 ? "" : "s"} registradas</p>
                  </div>
                  <span className="pill">{unitLabel(ingredient.baseUnit)}</span>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={purchases} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#d6e0ee" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#617089" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#617089" }} tickLine={false} axisLine={false} width={58} tickFormatter={(value) => money.format(value)} />
                      <Tooltip formatter={(value) => [money.format(Number(value)), "Precio unit."]} labelFormatter={(label) => `Fecha: ${label}`} />
                      <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid gap-2">
                  {purchases.slice(-3).reverse().map((purchase) => (
                    <div className="flex justify-between gap-3 text-sm" key={`${ingredient.id}-${purchase.date}-${purchase.total}`}>
                      <span className="text-muted">{purchase.date} - {purchase.label}</span>
                      <strong>{money.format(purchase.price)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={LineChartIcon} title="Sin historico de productos" copy="Registra compras para visualizar graficos por ingrediente." />
        )}
      </Panel>
    </div>
  );
}

function Metric({ icon: Icon, label, value, helper }) {
  return (
    <article className="panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <small className="text-sm font-semibold text-muted">{label}</small>
          <strong className="mt-2 block text-2xl tracking-tight">{value}</strong>
          {helper && <span className="mt-1 block text-xs text-muted">{helper}</span>}
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header} className={header.includes("Precio") || header.includes("Total") || header === "Compras" || header === "Recetas" ? "text-right" : ""}>{header}</th>)}</tr>
        </thead>
        <tbody className="[&_tr:hover]:bg-[#f8fbff]">{children}</tbody>
      </table>
    </div>
  );
}

function PurchaseForm({ ingredientOptions, savePurchase, busy }) {
  return (
    <form onSubmit={savePurchase} className="grid gap-4">
      <Field label="Fecha"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
      <Field label="Ingrediente">
        <select name="ingredientId" required>{ingredientOptions.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cantidad"><input name="quantity" type="number" min="0.01" step="0.01" required /></Field>
        <Field label="Unidad">
          <select name="unit" required>{["g", "kg", "ml", "l", "unidad"].map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select>
        </Field>
      </div>
      <Field label="Precio pagado"><input name="price" type="number" min="1" step="1" required /></Field>
      <button className="btn-primary" disabled={busy === "purchase"}>{busy === "purchase" ? <><Spinner /> Guardando</> : <><Save className="h-4 w-4" /> Guardar compra</>}</button>
    </form>
  );
}

function Purchases({ data, openModal }) {
  return (
    <div className="grid gap-5">
      <Panel>
        <SectionHeader
          title="Historico de precios"
          copy="Compras ordenadas por fecha para comparar variaciones."
          action={<button className="btn-primary" onClick={() => openModal("purchase")}><Plus className="h-4 w-4" /> Nueva compra</button>}
        />
        {data.purchases.length ? (
          <Table headers={["Fecha", "Ingrediente", "Compra", "Precio unitario"]}>
            {data.purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td>{purchase.date}</td>
                <td><strong>{purchase.ingredientName}</strong></td>
                <td>{purchase.quantity} {unitLabel(purchase.unit)} por {money.format(purchase.price)}</td>
                <td className="text-right font-semibold">{money.format(purchase.unitPrice)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={ShoppingBag} title="Sin compras registradas" copy="Cuando guardes compras, apareceran aqui con su precio unitario." />
        )}
      </Panel>
    </div>
  );
}

function IngredientForm({ saveIngredient, busy }) {
  return (
    <form onSubmit={saveIngredient} className="grid gap-4">
      <Field label="Nombre"><input name="name" type="text" placeholder="Harina, azucar, huevos" required /></Field>
      <Field label="Unidad base">
        <select name="baseUnit" required>{["g", "ml", "unidad"].map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select>
      </Field>
      <button className="btn-primary" disabled={busy === "ingredient"}>{busy === "ingredient" ? <><Spinner /> Guardando</> : <><Save className="h-4 w-4" /> Guardar ingrediente</>}</button>
    </form>
  );
}

function Ingredients({ data, openModal }) {
  return (
    <div className="grid gap-5">
      <Panel>
        <SectionHeader
          title="Lista de ingredientes"
          copy="Catalogo disponible para compras y recetas."
          action={<button className="btn-primary" onClick={() => openModal("ingredient")}><Plus className="h-4 w-4" /> Nuevo ingrediente</button>}
        />
        {data.ingredients.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.ingredients.map((ingredient) => (
              <article key={ingredient.id} className="item">
                <div className="flex items-start justify-between gap-3">
                  <strong>{ingredient.name}</strong>
                  <span className="pill">{unitLabel(ingredient.baseUnit)}</span>
                </div>
                <p className="mt-3 text-sm text-muted">
                  Ultimo precio: {ingredient.latestUnitPrice ? `${money.format(ingredient.latestUnitPrice)} / ${unitLabel(ingredient.baseUnit)}` : "sin compras"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Package} title="Sin ingredientes" copy="Agrega ingredientes antes de registrar recetas o compras." />
        )}
      </Panel>
    </div>
  );
}

function RecipeForm({ data, recipeLines, setRecipeLines, saveRecipe, busy }) {
  function updateLine(index, patch) {
    setRecipeLines((current) => current.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line));
  }

  return (
    <form onSubmit={saveRecipe} className="grid gap-4">
      <Field label="Nombre"><input name="name" type="text" placeholder="Torta de chocolate" required /></Field>
      <Field label="Personas o porciones"><input name="servings" type="number" min="1" step="1" required /></Field>
      <div className="grid gap-3">
        {recipeLines.map((line, index) => (
          <div className="grid gap-3 rounded-lg border border-line bg-[#f8fbff] p-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr_auto]" key={index}>
            <Field label="Ingrediente">
              <select value={line.ingredientId} onChange={(event) => {
                const ingredient = data.ingredients.find((item) => item.id === event.target.value);
                updateLine(index, { ingredientId: event.target.value, unit: ingredient?.baseUnit ?? line.unit });
              }} required>
                {data.ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
              </select>
            </Field>
            <Field label="Cantidad"><input value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} type="number" min="0.01" step="0.01" required /></Field>
            <Field label="Unidad">
              <select value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} required>
                {["g", "kg", "ml", "l", "unidad"].map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
              </select>
            </Field>
            <button className="btn-subtle self-end" type="button" onClick={() => setRecipeLines((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
              <Trash2 className="h-4 w-4" /> Quitar
            </button>
          </div>
        ))}
      </div>
      <button className="btn-ghost" type="button" onClick={() => setRecipeLines((current) => [...current, { ingredientId: data.ingredients[0]?.id || "", quantity: 100, unit: data.ingredients[0]?.baseUnit || "g" }])}>
        <Plus className="h-4 w-4" /> Agregar ingrediente
      </button>
      <button className="btn-primary" disabled={busy === "recipe"}>{busy === "recipe" ? <><Spinner /> Guardando</> : <><Save className="h-4 w-4" /> Guardar receta</>}</button>
    </form>
  );
}

function Recipes({ data, openModal }) {
  return (
    <div className="grid gap-5">
      <Panel>
        <SectionHeader
          title="Recetas guardadas"
          copy="Costo base segun ingredientes y ultimo precio de compra."
          action={<button className="btn-primary" onClick={() => openModal("recipe")}><Plus className="h-4 w-4" /> Nueva receta</button>}
        />
        {data.recipes.length ? (
          <div className="grid gap-3">
            {data.recipes.map((recipe) => {
              const cost = data.recipeCosts.find((item) => item.recipeId === recipe.id)?.ingredientCost ?? recipeIngredientCost(recipe, data.ingredients, data.purchases);
              return (
                <article key={recipe.id} className="item">
                  <div className="flex justify-between gap-4">
                    <div>
                      <strong>{recipe.name}</strong>
                      <p className="mt-1 text-sm text-muted">{recipe.servings} porciones</p>
                    </div>
                    <strong>{money.format(cost)}</strong>
                  </div>
                  <p className="mt-3 text-sm leading-6">{recipe.items.map((item) => `${item.ingredientName}: ${item.quantity} ${unitLabel(item.unit)}`).join(", ")}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={ClipboardList} title="Sin recetas" copy="Crea una receta base para comenzar a costear preparaciones." />
        )}
      </Panel>
    </div>
  );
}

function Costing({ data, costInput, setCostInput, costResult }) {
  function update(patch) {
    setCostInput((current) => ({ ...current, ...patch }));
  }

  return (
    <Panel className="max-w-6xl">
      <SectionHeader
        title="Calculadora de costo"
        copy="Ajusta porciones, horas, gastos y margen para obtener un precio sugerido."
        action={
          <select className="sm:max-w-sm" value={costInput.recipeId} onChange={(event) => {
            const recipe = data.recipes.find((item) => item.id === event.target.value);
            update({ recipeId: event.target.value, targetServings: recipe?.servings ?? 10, laborHours: recipe?.laborHours || 3 });
          }}>
            {data.recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
          </select>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
        <form className="grid gap-4">
          {[
            ["targetServings", "Porciones a producir"],
            ["laborHours", "Horas de trabajo"],
            ["hourlyRate", "Costo hora mano de obra"],
            ["utilities", "Luz / agua / gas"],
            ["otherCosts", "Otros gastos"],
            ["margin", "Margen deseado %"]
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input value={costInput[key]} onChange={(event) => update({ [key]: event.target.value })} type="number" min="0" step={key === "laborHours" ? "0.25" : "1"} />
            </Field>
          ))}
        </form>
        <div className="rounded-lg border border-line bg-[#f8fbff] p-5">
          <ResultLine label="Ingredientes" value={costResult?.ingredient_cost} />
          <ResultLine label="Mano de obra" value={costResult?.labor_cost} />
          <ResultLine label="Gastos" value={costResult?.overhead_cost} />
          <ResultLine label="Costo total" value={costResult?.total_cost} strong />
          <ResultLine label="Costo por porcion" value={costResult?.cost_per_serving} />
          <ResultLine label="Precio sugerido" value={costResult?.suggested_price} />
        </div>
      </div>
    </Panel>
  );
}

function ResultLine({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between border-b border-line py-3 last:border-0 ${strong ? "text-lg text-brand-dark" : ""}`}>
      <span className="text-muted">{label}</span>
      <strong>{money.format(Number(value ?? 0))}</strong>
    </div>
  );
}

function Settings({ data, saveSettings, busy }) {
  return (
    <Panel className="max-w-xl">
      <form onSubmit={saveSettings} className="grid gap-4">
        <SectionHeader title="Parametros por defecto" copy="Valores usados como base para nuevos calculos." />
        <Field label="Costo hora mano de obra"><input name="hourlyRate" type="number" min="0" step="1" defaultValue={data.settings.hourlyRate} /></Field>
        <Field label="Luz / agua / gas por receta"><input name="utilities" type="number" min="0" step="1" defaultValue={data.settings.utilities} /></Field>
        <Field label="Otros gastos por receta"><input name="otherCosts" type="number" min="0" step="1" defaultValue={data.settings.otherCosts} /></Field>
        <Field label="Margen deseado %"><input name="margin" type="number" min="0" max="95" step="1" defaultValue={data.settings.margin} /></Field>
        <button className="btn-primary" disabled={busy === "settings"}>{busy === "settings" ? <><Spinner /> Guardando</> : <><Save className="h-4 w-4" /> Guardar parametros</>}</button>
      </form>
    </Panel>
  );
}

function Admin({ data, busy, loadAdminOverview, loadAdminDetail }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1.2fr]">
      <Panel>
        <SectionHeader
          title="Usuarios"
          copy="Resumen de actividad y datos registrados por cuenta."
          action={<button className="btn-ghost" onClick={loadAdminOverview} disabled={busy === "admin"}>{busy === "admin" ? <><Spinner /> Actualizando</> : <><RefreshCw className="h-4 w-4" /> Actualizar</>}</button>}
        />
        {data.adminUsers.length ? (
          <Table headers={["Email", "Compras", "Recetas", "Total compras"]}>
            {data.adminUsers.map((user) => (
            <tr key={user.user_id} onClick={() => loadAdminDetail(user.user_id)} className="cursor-pointer hover:bg-[#f8fbff]">
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-brand"><UserRound className="h-4 w-4" /></span>
                    <div>
                      <strong>{user.email}</strong>
                      <div className="text-xs text-muted">{user.created_at?.slice(0, 10)}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right">{Number(user.purchase_count ?? 0)}</td>
                <td className="text-right">{Number(user.recipe_count ?? 0)}</td>
                <td className="text-right font-semibold">{money.format(Number(user.total_purchase_amount ?? 0))}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={ShieldCheck} title="Sin datos de usuarios" copy="Actualiza la vista para cargar el resumen administrativo." />
        )}
      </Panel>
      <Panel>
        <SectionHeader title="Detalle usuario" copy="Informacion operativa del usuario seleccionado." />
        {!data.adminDetail ? <EmptyState icon={UserRound} title="Selecciona un usuario" copy="El detalle aparecera en este panel." /> : <AdminDetail detail={data.adminDetail} />}
      </Panel>
    </div>
  );
}

function AdminDetail({ detail }) {
  const settings = detail.settings;
  return (
    <div className="grid gap-4">
      <article className="item">
        <div className="flex justify-between gap-4">
          <strong>{detail.user?.email}</strong>
          <span className="text-sm text-muted">{detail.user?.created_at?.slice(0, 10)}</span>
        </div>
        <p className="mt-2 text-sm text-muted">Ultimo acceso: {detail.user?.last_sign_in_at?.slice(0, 10) ?? "sin registro"}</p>
      </article>
      <div className="flex flex-wrap gap-2">
        <span className="pill">Hora: {money.format(Number(settings?.hourly_rate ?? 0))}</span>
        <span className="pill">Gastos: {money.format(Number(settings?.utilities_cost ?? 0) + Number(settings?.other_cost ?? 0))}</span>
        <span className="pill">Margen: {Number(settings?.target_margin ?? 0)}%</span>
      </div>
      <DetailList title="Ingredientes" items={(detail.ingredients ?? []).map((item) => `${item.name} - ${unitLabel(item.base_unit)}`)} />
      <section>
        <h3 className="mb-2 text-sm font-black">Ultimas compras</h3>
        <div className="grid gap-2">
          {(detail.purchases ?? []).slice(0, 8).map((purchase) => (
            <article className="item" key={purchase.id}>
              <div className="flex justify-between gap-4">
                <strong>{purchase.ingredient_name}</strong>
                <strong>{money.format(Number(purchase.total_price ?? 0))}</strong>
              </div>
              <p className="text-sm text-muted">{purchase.purchase_date} - {Number(purchase.quantity)} {unitLabel(purchase.unit)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DetailList({ title, items }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-black">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.length ? items.map((item) => <span className="pill" key={item}>{item}</span>) : <span className="text-sm text-muted">Sin datos.</span>}
      </div>
    </section>
  );
}
