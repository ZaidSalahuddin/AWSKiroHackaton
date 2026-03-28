// NutritionalTrackingScreen — Log meals and view macro summaries
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  fetchMenuItemSearch,
  fetchNutritionalSummary,
  logMeal,
  updateNutritionTargets,
} from '../api/apiHelpers';
import type { MenuItem, MealPeriod, NutritionTargets } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAROON = '#861F41';
const ORANGE = '#E5751F';
const LIGHT_BG = '#FDF6F0';
const CARD_BG = '#FFFFFF';
const BORDER = '#E8D5C4';
const TEXT_PRIMARY = '#1A0A00';
const TEXT_SECONDARY = '#6B4226';
const DANGER = '#C62828';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NutritionalSummary {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  over_calorie_target: boolean;
  targets: NutritionTargets | null;
}

interface LogItem {
  menuItem: MenuItem;
  servings: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  color: string;
}) {
  const pct = target && target > 0 ? Math.min(value / target, 1) : 0;
  const over = target != null && value > target;
  return (
    <View style={barStyles.row}>
      <View style={barStyles.labelRow}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={[barStyles.value, over && barStyles.overValue]}>
          {Math.round(value)}{unit}
          {target != null ? ` / ${Math.round(target)}${unit}` : ''}
        </Text>
      </View>
      <View style={barStyles.track}>
        <View
          style={[
            barStyles.fill,
            { width: `${pct * 100}%` as any, backgroundColor: over ? DANGER : color },
          ]}
        />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },
  value: { fontSize: 13, color: TEXT_SECONDARY },
  overValue: { color: DANGER, fontWeight: '700' },
  track: { height: 8, backgroundColor: BORDER, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});

// ─── Log Meal Tab ─────────────────────────────────────────────────────────────

function LogMealTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MenuItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [logItems, setLogItems] = useState<LogItem[]>([]);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>('lunch');
  const [submitting, setSubmitting] = useState(false);

  const PERIODS: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'late_night'];

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const items = await fetchMenuItemSearch(text.trim());
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const addItem = useCallback((item: MenuItem) => {
    setLogItems((prev) => {
      const existing = prev.find((li) => li.menuItem.id === item.id);
      if (existing) return prev;
      return [...prev, { menuItem: item, servings: 1 }];
    });
    setQuery('');
    setResults([]);
  }, []);

  const updateServings = useCallback((id: string, val: string) => {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return;
    setLogItems((prev) =>
      prev.map((li) => (li.menuItem.id === id ? { ...li, servings: n } : li)),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setLogItems((prev) => prev.filter((li) => li.menuItem.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (logItems.length === 0) {
      Alert.alert('No items', 'Add at least one menu item to log.');
      return;
    }
    setSubmitting(true);
    try {
      await logMeal({
        items: logItems.map((li) => ({ menuItemId: li.menuItem.id, servings: li.servings })),
        mealPeriod,
      });
      Alert.alert('Logged!', 'Your meal has been recorded.');
      setLogItems([]);
    } catch {
      Alert.alert('Error', 'Could not log meal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [logItems, mealPeriod]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: LIGHT_BG }}
        contentContainerStyle={styles.tabContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Meal period selector */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Meal Period</Text>
          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <Pressable
                key={p}
                style={[styles.periodBtn, mealPeriod === p && styles.periodBtnActive]}
                onPress={() => setMealPeriod(p)}
                accessibilityRole="radio"
                accessibilityState={{ selected: mealPeriod === p }}
                accessibilityLabel={p.replace('_', ' ')}
              >
                <Text style={[styles.periodBtnText, mealPeriod === p && styles.periodBtnTextActive]}>
                  {p.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Search */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Search Menu Items</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search by name…"
            placeholderTextColor={TEXT_SECONDARY}
            accessibilityLabel="Search menu items"
            returnKeyType="search"
          />
          {searching && <ActivityIndicator color={MAROON} style={{ marginTop: 8 }} />}
          {results.map((item) => (
            <Pressable
              key={item.id}
              style={styles.resultRow}
              onPress={() => addItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{item.name}</Text>
                {item.nutrition && (
                  <Text style={styles.resultMeta}>
                    {item.nutrition.calories} cal · {item.nutrition.protein_g}g protein
                  </Text>
                )}
              </View>
              <Text style={styles.addIcon}>＋</Text>
            </Pressable>
          ))}
        </View>

        {/* Log items */}
        {logItems.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Items to Log</Text>
            {logItems.map((li) => (
              <View key={li.menuItem.id} style={styles.logItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logItemName}>{li.menuItem.name}</Text>
                  {li.menuItem.nutrition && (
                    <Text style={styles.resultMeta}>
                      {Math.round(li.menuItem.nutrition.calories * li.servings)} cal total
                    </Text>
                  )}
                </View>
                <TextInput
                  style={styles.servingsInput}
                  value={String(li.servings)}
                  onChangeText={(v) => updateServings(li.menuItem.id, v)}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Servings for ${li.menuItem.name}`}
                />
                <Text style={styles.servingsLabel}>srv</Text>
                <Pressable
                  onPress={() => removeItem(li.menuItem.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${li.menuItem.name}`}
                >
                  <Text style={styles.removeIcon}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Log meal"
        >
          {submitting
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.submitBtnText}>Log Meal</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Summary Tab ──────────────────────────────────────────────────────────────

function SummaryTab() {
  const [range, setRange] = useState<'daily' | 'weekly'>('daily');
  const [summary, setSummary] = useState<NutritionalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Targets editor state
  const [editingTargets, setEditingTargets] = useState(false);
  const [targetDraft, setTargetDraft] = useState<NutritionTargets>({
    calories: 2000,
    protein_g: 50,
    carbs_g: 250,
    fat_g: 65,
  });
  const [savingTargets, setSavingTargets] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await fetchNutritionalSummary(today, range);
      setSummary(data);
      if (data.targets) {
        setTargetDraft(data.targets);
      }
    } catch {
      setError('Could not load nutritional summary.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleSaveTargets = useCallback(async () => {
    setSavingTargets(true);
    try {
      await updateNutritionTargets(targetDraft);
      setEditingTargets(false);
      loadSummary();
    } catch {
      Alert.alert('Error', 'Could not save targets. Please try again.');
    } finally {
      setSavingTargets(false);
    }
  }, [targetDraft, loadSummary]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: LIGHT_BG }}
      contentContainerStyle={styles.tabContent}
    >
      {/* Range toggle */}
      <View style={styles.toggleRow}>
        {(['daily', 'weekly'] as const).map((r) => (
          <Pressable
            key={r}
            style={[styles.toggleBtn, range === r && styles.toggleBtnActive]}
            onPress={() => setRange(r)}
            accessibilityRole="radio"
            accessibilityState={{ selected: range === r }}
            accessibilityLabel={r === 'daily' ? 'Daily summary' : 'Weekly summary'}
          >
            <Text style={[styles.toggleBtnText, range === r && styles.toggleBtnTextActive]}>
              {r === 'daily' ? 'Today' : 'This Week'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && <ActivityIndicator color={MAROON} style={{ marginTop: 32 }} />}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {summary && !loading && (
        <>
          {/* Over-calorie indicator */}
          {summary.over_calorie_target && (
            <View style={styles.overCalorieBanner} accessibilityRole="alert">
              <Text style={styles.overCalorieIcon}>⚠️</Text>
              <Text style={styles.overCalorieText}>
                You've exceeded your daily calorie target
              </Text>
            </View>
          )}

          {/* Macro progress bars */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {range === 'daily' ? "Today's Nutrition" : "This Week's Nutrition"}
            </Text>
            <MacroBar
              label="Calories"
              value={summary.calories}
              target={summary.targets?.calories ?? null}
              unit=" kcal"
              color={MAROON}
            />
            <MacroBar
              label="Protein"
              value={summary.protein_g}
              target={summary.targets?.protein_g ?? null}
              unit="g"
              color={ORANGE}
            />
            <MacroBar
              label="Carbohydrates"
              value={summary.carbs_g}
              target={summary.targets?.carbs_g ?? null}
              unit="g"
              color="#5B8DB8"
            />
            <MacroBar
              label="Fat"
              value={summary.fat_g}
              target={summary.targets?.fat_g ?? null}
              unit="g"
              color="#7B5EA7"
            />
            <View style={styles.extraRow}>
              <Text style={styles.extraLabel}>Fiber</Text>
              <Text style={styles.extraValue}>{Math.round(summary.fiber_g)}g</Text>
            </View>
            <View style={styles.extraRow}>
              <Text style={styles.extraLabel}>Sodium</Text>
              <Text style={styles.extraValue}>{Math.round(summary.sodium_mg)}mg</Text>
            </View>
          </View>

          {/* Nutrition targets editor */}
          <View style={styles.card}>
            <View style={styles.targetHeader}>
              <Text style={styles.sectionTitle}>Daily Targets</Text>
              {!editingTargets && (
                <Pressable
                  onPress={() => setEditingTargets(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit nutrition targets"
                  hitSlop={8}
                >
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              )}
            </View>

            {editingTargets ? (
              <>
                {(
                  [
                    { key: 'calories', label: 'Calories (kcal)' },
                    { key: 'protein_g', label: 'Protein (g)' },
                    { key: 'carbs_g', label: 'Carbs (g)' },
                    { key: 'fat_g', label: 'Fat (g)' },
                  ] as { key: keyof NutritionTargets; label: string }[]
                ).map(({ key, label }) => (
                  <View key={key} style={styles.targetRow}>
                    <Text style={styles.targetLabel}>{label}</Text>
                    <TextInput
                      style={styles.targetInput}
                      value={String(targetDraft[key])}
                      onChangeText={(v) => {
                        const n = parseFloat(v);
                        if (!isNaN(n) && n >= 0) {
                          setTargetDraft((prev) => ({ ...prev, [key]: n }));
                        }
                      }}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`${label} target`}
                    />
                  </View>
                ))}
                <View style={styles.targetActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => setEditingTargets(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel editing targets"
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.saveTargetBtn, pressed && { opacity: 0.85 }]}
                    onPress={handleSaveTargets}
                    disabled={savingTargets}
                    accessibilityRole="button"
                    accessibilityLabel="Save nutrition targets"
                  >
                    {savingTargets
                      ? <ActivityIndicator color="#FFF" size="small" />
                      : <Text style={styles.saveTargetBtnText}>Save Targets</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              summary.targets ? (
                <>
                  {[
                    { label: 'Calories', value: `${summary.targets.calories} kcal` },
                    { label: 'Protein', value: `${summary.targets.protein_g}g` },
                    { label: 'Carbs', value: `${summary.targets.carbs_g}g` },
                    { label: 'Fat', value: `${summary.targets.fat_g}g` },
                  ].map(({ label, value }) => (
                    <View key={label} style={styles.extraRow}>
                      <Text style={styles.extraLabel}>{label}</Text>
                      <Text style={styles.extraValue}>{value}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.noTargetsText}>
                  No targets set. Tap Edit to add your daily goals.
                </Text>
              )
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NutritionalTrackingScreen() {
  const [activeTab, setActiveTab] = useState<'log' | 'summary'>('log');

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'log' && styles.tabActive]}
          onPress={() => setActiveTab('log')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'log' }}
          accessibilityLabel="Log Meal tab"
        >
          <Text style={[styles.tabText, activeTab === 'log' && styles.tabTextActive]}>
            🍽  Log Meal
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'summary' && styles.tabActive]}
          onPress={() => setActiveTab('summary')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'summary' }}
          accessibilityLabel="Summary tab"
        >
          <Text style={[styles.tabText, activeTab === 'summary' && styles.tabTextActive]}>
            📊  Summary
          </Text>
        </Pressable>
      </View>

      {activeTab === 'log' ? <LogMealTab /> : <SummaryTab />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LIGHT_BG },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: MAROON },
  tabText: { fontSize: 15, fontWeight: '600', color: TEXT_SECONDARY },
  tabTextActive: { color: MAROON },

  // Shared
  tabContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 12 },
  errorBanner: {
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: DANGER,
  },
  errorText: { color: '#B71C1C', fontSize: 14 },

  // Over-calorie banner
  overCalorieBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEA',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DANGER,
    gap: 10,
  },
  overCalorieIcon: { fontSize: 20 },
  overCalorieText: { flex: 1, fontSize: 14, fontWeight: '600', color: DANGER },

  // Range toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
  },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: MAROON },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY },
  toggleBtnTextActive: { color: '#FFF' },

  // Extras (fiber, sodium)
  extraRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  extraLabel: { fontSize: 13, color: TEXT_SECONDARY },
  extraValue: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },

  // Targets editor
  targetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  editLink: { fontSize: 14, color: ORANGE, fontWeight: '600' },
  targetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  targetLabel: { flex: 1, fontSize: 14, color: TEXT_PRIMARY },
  targetInput: {
    width: 80,
    height: 40,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: LIGHT_BG,
    textAlign: 'right',
  },
  targetActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY },
  saveTargetBtn: {
    flex: 2,
    height: 44,
    borderRadius: 8,
    backgroundColor: MAROON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTargetBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  noTargetsText: { fontSize: 14, color: TEXT_SECONDARY, fontStyle: 'italic' },

  // Meal period selector
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: LIGHT_BG,
    minHeight: 44,
    justifyContent: 'center',
  },
  periodBtnActive: { backgroundColor: MAROON, borderColor: MAROON },
  periodBtnText: { fontSize: 13, fontWeight: '500', color: TEXT_SECONDARY, textTransform: 'capitalize' },
  periodBtnTextActive: { color: '#FFF' },

  // Search
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: LIGHT_BG,
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    minHeight: 44,
  },
  resultName: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  resultMeta: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  addIcon: { fontSize: 22, color: ORANGE, fontWeight: '700', paddingLeft: 8 },

  // Log items
  logItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 8,
    minHeight: 44,
  },
  logItemName: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  servingsInput: {
    width: 56,
    height: 40,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: LIGHT_BG,
    textAlign: 'center',
  },
  servingsLabel: { fontSize: 12, color: TEXT_SECONDARY },
  removeIcon: { fontSize: 16, color: DANGER, paddingLeft: 4 },

  // Submit
  submitBtn: {
    backgroundColor: MAROON,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MAROON,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  submitBtnPressed: { opacity: 0.85 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
