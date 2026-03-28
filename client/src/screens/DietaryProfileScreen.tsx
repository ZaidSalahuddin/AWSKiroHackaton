import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchDietaryProfile, saveDietaryProfile } from '../api/apiHelpers';
import type { DietaryProfile } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAROON = '#861F41';
const ORANGE = '#E5751F';
const LIGHT_BG = '#FDF6F0';
const CARD_BG = '#FFFFFF';
const BORDER = '#E8D5C4';
const TEXT_PRIMARY = '#1A0A00';
const TEXT_SECONDARY = '#6B4226';
const MAX_ALLERGENS = 10;

const RESTRICTION_OPTIONS: { key: string; label: string }[] = [
  { key: 'vegan', label: 'Vegan' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'gluten-free', label: 'Gluten-Free' },
  { key: 'halal', label: 'Halal' },
  { key: 'kosher', label: 'Kosher' },
];

const DEFAULT_PROFILE: DietaryProfile = {
  restrictions: [],
  allergens: [],
  active: true,
  optInIncomplete: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DietaryProfileScreen() {
  const [profile, setProfile] = useState<DietaryProfile>(DEFAULT_PROFILE);
  const [allergenInput, setAllergenInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profile on mount
  useEffect(() => {
    let cancelled = false;
    fetchDietaryProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your dietary profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Toggle a restriction on/off
  const toggleRestriction = useCallback((key: string) => {
    setProfile((prev) => {
      const has = prev.restrictions.includes(key);
      return {
        ...prev,
        restrictions: has
          ? prev.restrictions.filter((r) => r !== key)
          : [...prev.restrictions, key],
      };
    });
  }, []);

  // Add allergen chip
  const addAllergen = useCallback(() => {
    const trimmed = allergenInput.trim();
    if (!trimmed) return;
    if (profile.allergens.length >= MAX_ALLERGENS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_ALLERGENS} allergens.`);
      return;
    }
    if (profile.allergens.map((a) => a.toLowerCase()).includes(trimmed.toLowerCase())) {
      setAllergenInput('');
      return;
    }
    setProfile((prev) => ({ ...prev, allergens: [...prev.allergens, trimmed] }));
    setAllergenInput('');
  }, [allergenInput, profile.allergens]);

  // Remove allergen chip
  const removeAllergen = useCallback((allergen: string) => {
    setProfile((prev) => ({
      ...prev,
      allergens: prev.allergens.filter((a) => a !== allergen),
    }));
  }, []);

  // Save profile
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveDietaryProfile(profile);
      setProfile(saved);
      Alert.alert('Saved', 'Your dietary profile has been updated.');
    } catch {
      setError('Failed to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [profile]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MAROON} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dietary Profile</Text>
          <Text style={styles.headerSubtitle}>
            Customize your restrictions so we only show food that's right for you.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Active toggle */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardLabel}>Filtering Active</Text>
              <Text style={styles.cardHint}>
                Turn off to browse all items without restrictions.
              </Text>
            </View>
            <Switch
              value={profile.active}
              onValueChange={(val) => setProfile((p) => ({ ...p, active: val }))}
              trackColor={{ false: BORDER, true: MAROON }}
              thumbColor={profile.active ? ORANGE : '#FFF'}
              accessibilityLabel="Toggle dietary filtering"
            />
          </View>
        </View>

        {/* Restrictions */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dietary Restrictions</Text>
          {RESTRICTION_OPTIONS.map(({ key, label }) => {
            const checked = profile.restrictions.includes(key);
            return (
              <Pressable
                key={key}
                style={styles.checkRow}
                onPress={() => toggleRestriction(key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Allergens */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Allergens{' '}
            <Text style={styles.allergenCount}>
              ({profile.allergens.length}/{MAX_ALLERGENS})
            </Text>
          </Text>
          <Text style={styles.cardHint}>
            Add specific allergens to flag items that may contain them.
          </Text>

          {/* Chips */}
          {profile.allergens.length > 0 && (
            <View style={styles.chipsRow}>
              {profile.allergens.map((allergen) => (
                <View key={allergen} style={styles.chip}>
                  <Text style={styles.chipText}>{allergen}</Text>
                  <Pressable
                    onPress={() => removeAllergen(allergen)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${allergen}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipRemove}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={allergenInput}
              onChangeText={setAllergenInput}
              placeholder="e.g. peanuts, shellfish…"
              placeholderTextColor={TEXT_SECONDARY}
              returnKeyType="done"
              onSubmitEditing={addAllergen}
              maxLength={40}
              accessibilityLabel="Allergen input"
            />
            <Pressable
              style={[
                styles.addBtn,
                profile.allergens.length >= MAX_ALLERGENS && styles.addBtnDisabled,
              ]}
              onPress={addAllergen}
              disabled={profile.allergens.length >= MAX_ALLERGENS}
              accessibilityRole="button"
              accessibilityLabel="Add allergen"
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Opt-in incomplete */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardLabel}>Include Incomplete Allergen Data</Text>
              <Text style={styles.cardHint}>
                Show items labeled "Allergen info incomplete" in your filtered results.
              </Text>
            </View>
            <Switch
              value={profile.optInIncomplete}
              onValueChange={(val) =>
                setProfile((p) => ({ ...p, optInIncomplete: val }))
              }
              trackColor={{ false: BORDER, true: MAROON }}
              thumbColor={profile.optInIncomplete ? ORANGE : '#FFF'}
              accessibilityLabel="Include items with incomplete allergen data"
            />
          </View>
        </View>

        {/* Save button */}
        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save dietary profile"
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>Save Profile</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: LIGHT_BG },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: LIGHT_BG },

  header: { marginBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: MAROON, marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: TEXT_SECONDARY, lineHeight: 20 },

  errorBanner: {
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  errorText: { color: '#B71C1C', fontSize: 14 },

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
  cardLabel: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 2 },
  cardHint: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18, marginBottom: 4 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Checkboxes
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: MAROON,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: MAROON },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  checkLabel: { fontSize: 15, color: TEXT_PRIMARY },

  // Allergen chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5E6D8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ORANGE,
    gap: 6,
  },
  chipText: { fontSize: 13, color: MAROON, fontWeight: '500' },
  chipRemove: { fontSize: 18, color: ORANGE, lineHeight: 20, fontWeight: '700' },

  // Allergen input
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  textInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: LIGHT_BG,
  },
  addBtn: {
    height: 44,
    paddingHorizontal: 18,
    backgroundColor: ORANGE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  addBtnDisabled: { backgroundColor: BORDER },
  addBtnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },

  // Save button
  saveBtn: {
    backgroundColor: MAROON,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: MAROON,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  allergenCount: { fontSize: 13, color: TEXT_SECONDARY, fontWeight: '400' },
});
