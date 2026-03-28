/**
 * MenuItemDetailScreen — VT Dining Ranker
 *
 * Displays:
 *  - Name, description, ingredients, allergen tags, allergen_warning banner
 *  - Health Score and full nutrition panel
 *  - Previous_Availability_Trend (bar chart by day-of-week)
 *  - Predicted next appearance or "Not enough history to predict"
 *  - Subscribe/unsubscribe button for availability notifications
 *  - Photo reviews (CDN images) with report button
 *  - New photos via WebSocket push within 30 s
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import apiClient from '../api/client';
import wsClient from '../websocket/wsClient';
import type {
  AvailabilityHistory,
  AvailabilityPrediction,
  MenuItem,
  MealPeriod,
  Rating,
  WsServerMessage,
} from '../types';

// ── Palette (matches HomeScreen) ─────────────────────────────────────────────

const COLORS = {
  maroon: '#861F41',
  maroonDark: '#5C1530',
  maroonDeep: '#3D0E22',
  orange: '#E5751F',
  orangeLight: '#F4A261',
  cream: '#FDF6EC',
  offWhite: '#FAF7F4',
  white: '#FFFFFF',
  charcoal: '#1A1A1A',
  slate: '#4A4A4A',
  muted: '#8A8A8A',
  border: '#E8DDD5',
  openGreen: '#2D7A4F',
  closedRed: '#C0392B',
  warningAmber: '#D97706',
  cardBg: '#FFFFFF',
  allergenRed: '#B91C1C',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhotoReview {
  id: string;
  ratingId: string;
  storageUrl: string;
  status: 'visible' | 'hidden' | 'removed';
  createdAt: string;
  studentDisplayName?: string;
}

interface RatingWithPhoto extends Rating {
  photo?: PhotoReview;
  studentDisplayName?: string;
}

interface AvailabilityTrendEntry {
  dayOfWeek: string; // 'Mon' | 'Tue' | ...
  mealPeriod: MealPeriod;
  count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_LABELS: Record<MealPeriod, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  late_night: 'Late Night',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayAbbrev(dateStr: string): string {
  const d = new Date(dateStr);
  return DAYS_SHORT[d.getDay() === 0 ? 6 : d.getDay() - 1]; // Mon=0 … Sun=6
}

function buildTrend(history: AvailabilityHistory): AvailabilityTrendEntry[] {
  const counts: Record<string, number> = {};
  for (const a of history.appearances) {
    const key = dayAbbrev(a.appearedOn);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return DAYS_SHORT.map((d) => ({
    dayOfWeek: d,
    mealPeriod: 'lunch' as MealPeriod, // aggregated across all meal periods
    count: counts[d] ?? 0,
  }));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AllergenWarningBanner() {
  return (
    <View
      style={styles.allergenBanner}
      accessibilityRole="alert"
      accessibilityLabel="Allergen warning: this item contains allergens that match your dietary profile"
    >
      <Text style={styles.allergenBannerIcon}>⚠️</Text>
      <Text style={styles.allergenBannerText}>
        Allergen Warning — this item contains allergens matching your profile
      </Text>
    </View>
  );
}

interface AllergenTagsProps {
  allergens: string[];
}

function AllergenTags({ allergens }: AllergenTagsProps) {
  if (allergens.length === 0) return null;
  return (
    <View style={styles.tagsRow} accessibilityLabel={`Allergens: ${allergens.join(', ')}`}>
      {allergens.map((a) => (
        <View key={a} style={styles.allergenTag}>
          <Text style={styles.allergenTagText}>{a}</Text>
        </View>
      ))}
    </View>
  );
}

interface HealthScoreBadgeProps {
  score: number;
}

function HealthScoreBadge({ score }: HealthScoreBadgeProps) {
  const color =
    score >= 7 ? COLORS.openGreen : score >= 4 ? COLORS.warningAmber : COLORS.closedRed;
  return (
    <View
      style={[styles.healthScoreCircle, { borderColor: color }]}
      accessibilityLabel={`Health score: ${score.toFixed(1)} out of 10`}
    >
      <Text style={[styles.healthScoreValue, { color }]}>{score.toFixed(1)}</Text>
      <Text style={[styles.healthScoreLabel, { color }]}>/ 10</Text>
    </View>
  );
}

interface NutritionPanelProps {
  nutrition: MenuItem['nutrition'];
  unavailable: boolean;
}

function NutritionPanel({ nutrition, unavailable }: NutritionPanelProps) {
  if (unavailable || !nutrition) {
    return (
      <View style={styles.nutritionUnavailable} accessibilityLabel="Nutrition info unavailable">
        <Text style={styles.nutritionUnavailableText}>Nutrition info unavailable</Text>
      </View>
    );
  }
  const rows: { label: string; value: string; unit: string }[] = [
    { label: 'Calories', value: String(nutrition.calories), unit: 'kcal' },
    { label: 'Protein', value: nutrition.protein_g.toFixed(1), unit: 'g' },
    { label: 'Carbs', value: nutrition.carbs_g.toFixed(1), unit: 'g' },
    { label: 'Fat', value: nutrition.fat_g.toFixed(1), unit: 'g' },
    { label: 'Fiber', value: nutrition.fiber_g.toFixed(1), unit: 'g' },
    { label: 'Sodium', value: nutrition.sodium_mg.toFixed(0), unit: 'mg' },
  ];
  return (
    <View style={styles.nutritionGrid} accessibilityLabel="Nutrition information panel">
      {rows.map((r) => (
        <View key={r.label} style={styles.nutritionCell} accessibilityLabel={`${r.label}: ${r.value} ${r.unit}`}>
          <Text style={styles.nutritionValue}>{r.value}</Text>
          <Text style={styles.nutritionUnit}>{r.unit}</Text>
          <Text style={styles.nutritionLabel}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
}

interface AvailabilityTrendChartProps {
  trend: AvailabilityTrendEntry[];
}

function AvailabilityTrendChart({ trend }: AvailabilityTrendChartProps) {
  const maxCount = Math.max(...trend.map((t) => t.count), 1);
  const BAR_MAX_HEIGHT = 60;
  return (
    <View
      style={styles.trendChart}
      accessibilityLabel="Availability trend chart by day of week"
    >
      {trend.map((entry) => {
        const barHeight = Math.max((entry.count / maxCount) * BAR_MAX_HEIGHT, entry.count > 0 ? 4 : 0);
        return (
          <View
            key={entry.dayOfWeek}
            style={styles.trendBarCol}
            accessibilityLabel={`${entry.dayOfWeek}: appeared ${entry.count} time${entry.count !== 1 ? 's' : ''}`}
          >
            <Text style={styles.trendBarCount}>{entry.count > 0 ? entry.count : ''}</Text>
            <View style={styles.trendBarTrack}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height: barHeight,
                    backgroundColor: entry.count > 0 ? COLORS.maroon : COLORS.border,
                  },
                ]}
              />
            </View>
            <Text style={styles.trendBarDay}>{entry.dayOfWeek}</Text>
          </View>
        );
      })}
    </View>
  );
}

interface PredictionBannerProps {
  prediction: AvailabilityPrediction | null;
}

function PredictionBanner({ prediction }: PredictionBannerProps) {
  if (!prediction) return null;
  if (!prediction.predictionAvailable) {
    return (
      <View style={styles.predictionBox} accessibilityLabel="Not enough history to predict next appearance">
        <Text style={styles.predictionNoData}>Not enough history to predict</Text>
      </View>
    );
  }
  const next = prediction.nextAppearances?.[0];
  if (!next) return null;
  return (
    <View style={styles.predictionBox} accessibilityLabel={`Predicted next appearance: ${next.dayOfWeek} at ${MEAL_LABELS[next.mealPeriod]}`}>
      <Text style={styles.predictionLabel}>PREDICTED NEXT APPEARANCE</Text>
      <Text style={styles.predictionValue}>
        {next.dayOfWeek} · {MEAL_LABELS[next.mealPeriod]}
      </Text>
    </View>
  );
}

interface SubscribeButtonProps {
  subscribed: boolean;
  loading: boolean;
  onPress: () => void;
}

function SubscribeButton({ subscribed, loading, onPress }: SubscribeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }: { pressed: boolean }) => [
        styles.subscribeBtn,
        subscribed && styles.subscribeBtnActive,
        pressed && styles.subscribeBtnPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={subscribed ? 'Unsubscribe from availability notifications' : 'Subscribe to availability notifications'}
      accessibilityState={{ busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={subscribed ? COLORS.maroon : COLORS.white} />
      ) : (
        <Text style={[styles.subscribeBtnText, subscribed && styles.subscribeBtnTextActive]}>
          {subscribed ? '🔔 Subscribed' : '🔕 Notify Me'}
        </Text>
      )}
    </Pressable>
  );
}

interface PhotoCardProps {
  photo: PhotoReview;
  onReport: (photoId: string) => void;
}

function PhotoCard({ photo, onReport }: PhotoCardProps) {
  return (
    <View style={styles.photoCard} accessibilityLabel={`Photo review by ${photo.studentDisplayName ?? 'a student'}`}>
      <Image
        source={{ uri: photo.storageUrl }}
        style={styles.photoImage}
        resizeMode="cover"
        accessibilityLabel={`Food photo uploaded by ${photo.studentDisplayName ?? 'a student'}`}
      />
      <View style={styles.photoFooter}>
        <Text style={styles.photoAuthor}>{photo.studentDisplayName ?? 'Student'}</Text>
        <Pressable
          onPress={() => onReport(photo.id)}
          style={styles.reportBtn}
          accessibilityRole="button"
          accessibilityLabel="Report this photo as inappropriate"
          accessibilityHint="Flags this photo for moderation review"
        >
          <Text style={styles.reportBtnText}>Report</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

interface RouteParams {
  itemId: string;
}

interface Props {
  route: { params: RouteParams };
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params: Record<string, unknown>) => void;
  };
}

export default function MenuItemDetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;

  const [item, setItem] = useState<MenuItem | null>(null);
  const [history, setHistory] = useState<AvailabilityHistory | null>(null);
  const [prediction, setPrediction] = useState<AvailabilityPrediction | null>(null);
  const [photos, setPhotos] = useState<PhotoReview[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);

  // Animated fade-in for new photos pushed via WebSocket
  const newPhotoAnim = useRef(new Animated.Value(0)).current;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    try {
      const [itemRes, historyRes, predictionRes, photosRes] = await Promise.allSettled([
        apiClient.get<MenuItem>(`/api/menu-items/${itemId}`),
        apiClient.get<AvailabilityHistory>(`/api/menu-items/${itemId}/availability-history`),
        apiClient.get<AvailabilityPrediction>(`/api/menu-items/${itemId}/availability-prediction`),
        apiClient.get<{ ratings: RatingWithPhoto[] }>(`/api/menu-items/${itemId}/ratings`),
      ]);

      if (itemRes.status === 'fulfilled') setItem(itemRes.value.data);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data);
      if (predictionRes.status === 'fulfilled') setPrediction(predictionRes.value.data);
      if (photosRes.status === 'fulfilled') {
        const visible = photosRes.value.data.ratings
          .filter((r: RatingWithPhoto) => r.photo && r.photo.status === 'visible')
          .map((r: RatingWithPhoto) => ({ ...r.photo!, studentDisplayName: r.studentDisplayName }));
        setPhotos(visible);
      }

      // Check subscription status
      try {
        const subRes = await apiClient.get<{ subscribed: boolean }>(
          `/api/menu-items/${itemId}/subscribe`,
        );
        setSubscribed(subRes.data.subscribed);
      } catch {
        // Not subscribed or endpoint unavailable
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── WebSocket — live photo push ────────────────────────────────────────────

  useEffect(() => {
    wsClient.connect();
    const channel = `photos:${itemId}`;
    wsClient.subscribe(channel);

    const unsub = wsClient.onMessage((msg: WsServerMessage) => {
      if (msg.channel !== channel) return;
      const photo = msg.data as PhotoReview;
      if (!photo?.id || photo.status !== 'visible') return;

      setPhotos((prev: PhotoReview[]) => {
        if (prev.some((p: PhotoReview) => p.id === photo.id)) return prev;
        return [photo, ...prev];
      });

      // Animate the new photo in
      newPhotoAnim.setValue(0);
      Animated.timing(newPhotoAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      wsClient.unsubscribe(channel);
      unsub();
    };
  }, [itemId, newPhotoAnim]);

  // ── Interactions ───────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const toggleSubscribe = useCallback(async () => {
    setSubscribeLoading(true);
    try {
      if (subscribed) {
        await apiClient.delete(`/api/menu-items/${itemId}/subscribe`);
        setSubscribed(false);
      } else {
        await apiClient.post(`/api/menu-items/${itemId}/subscribe`);
        setSubscribed(true);
      }
    } catch {
      Alert.alert('Error', 'Could not update subscription. Please try again.');
    } finally {
      setSubscribeLoading(false);
    }
  }, [itemId, subscribed]);

  const reportPhoto = useCallback((photoId: string) => {
    Alert.alert(
      'Report Photo',
      'Are you sure you want to report this photo as inappropriate?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.post(`/api/photos/${photoId}/report`);
              setPhotos((prev: PhotoReview[]) => prev.filter((p: PhotoReview) => p.id !== photoId));
              Alert.alert('Reported', 'The photo has been flagged for review.');
            } catch {
              Alert.alert('Error', 'Could not submit report. Please try again.');
            }
          },
        },
      ],
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel="Loading menu item details">
        <ActivityIndicator size="large" color={COLORS.maroon} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel="Menu item not found">
        <Text style={styles.errorText}>Item not found.</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>← Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const trend = history ? buildTrend(history) : null;
  const nutritionUnavailable = !item.nutrition;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.maroonDeep} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.maroon}
            colors={[COLORS.maroon]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header bar ── */}
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back to previous screen"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          <Text style={styles.headerStation} numberOfLines={1}>{item.station}</Text>
        </View>

        {/* ── Allergen warning ── */}
        {item.allergenWarning && <AllergenWarningBanner />}

        {/* ── Item header ── */}
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemName} accessibilityRole="header">{item.name}</Text>
            {item.healthScore != null && <HealthScoreBadge score={item.healthScore} />}
          </View>
          {item.description ? (
            <Text style={styles.itemDescription}>{item.description}</Text>
          ) : null}
        </View>

        {/* ── Allergen tags ── */}
        {(item.allergens.length > 0 || !item.allergenDataComplete) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ALLERGENS</Text>
            <AllergenTags allergens={item.allergens} />
            {!item.allergenDataComplete && (
              <Text style={styles.incompleteAllergenNote} accessibilityRole="alert">
                ⚠ Allergen info incomplete
              </Text>
            )}
          </View>
        )}

        {/* ── Nutrition panel ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NUTRITION</Text>
          <NutritionPanel nutrition={item.nutrition} unavailable={nutritionUnavailable} />
        </View>

        {/* ── Availability trend ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>AVAILABILITY TREND</Text>
          {trend ? (
            <AvailabilityTrendChart trend={trend} />
          ) : (
            <Text style={styles.mutedText}>No availability history yet.</Text>
          )}
        </View>

        {/* ── Prediction + subscribe ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NEXT APPEARANCE</Text>
          <PredictionBanner prediction={prediction} />
          <SubscribeButton
            subscribed={subscribed}
            loading={subscribeLoading}
            onPress={toggleSubscribe}
          />
        </View>

        {/* ── Rate this item ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RATINGS</Text>
          <Pressable
            onPress={() =>
              navigation.navigate('RatingSubmission', {
                menuItemId: itemId,
                menuItemName: item.name,
              })
            }
            style={({ pressed }: { pressed: boolean }) => [
              styles.rateBtn,
              pressed && styles.rateBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${item.name}`}
            accessibilityHint="Opens the rating submission screen for this menu item"
          >
            <Text style={styles.rateBtnText}>⭐ Rate This Item</Text>
          </Pressable>
        </View>

        {/* ── Photo reviews ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PHOTO REVIEWS</Text>
          {photos.length === 0 ? (
            <Text style={styles.mutedText}>No photos yet. Be the first to add one!</Text>
          ) : (
            photos.map((photo: PhotoReview, idx: number) => (
              <Animated.View
                key={photo.id}
                style={idx === 0 ? { opacity: newPhotoAnim } : undefined}
              >
                <PhotoCard photo={photo} onReport={reportPhoto} />
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.maroonDeep,
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.offWhite,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.offWhite,
    gap: 12,
  },
  loadingText: {
    color: COLORS.slate,
    fontSize: 15,
  },
  errorText: {
    color: COLORS.closedRed,
    fontSize: 16,
    marginBottom: 16,
  },

  // Header bar
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.maroon,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  headerStation: {
    flex: 1,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Allergen warning banner
  allergenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.allergenRed,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  allergenBannerIcon: {
    fontSize: 18,
  },
  allergenBannerText: {
    flex: 1,
    color: COLORS.allergenRed,
    fontSize: 14,
    fontWeight: '600',
  },

  // Item header
  itemHeader: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.charcoal,
    lineHeight: 28,
  },
  itemDescription: {
    fontSize: 15,
    color: COLORS.slate,
    lineHeight: 22,
  },

  // Health score
  healthScoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    flexShrink: 0,
  },
  healthScoreValue: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  healthScoreLabel: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Sections
  section: {
    backgroundColor: COLORS.white,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  mutedText: {
    color: COLORS.muted,
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Allergen tags
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  allergenTag: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  allergenTagText: {
    color: COLORS.allergenRed,
    fontSize: 12,
    fontWeight: '600',
  },
  incompleteAllergenNote: {
    marginTop: 10,
    color: COLORS.warningAmber,
    fontSize: 13,
    fontWeight: '500',
  },

  // Nutrition
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    backgroundColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  nutritionCell: {
    width: '33.33%',
    backgroundColor: COLORS.white,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.charcoal,
  },
  nutritionUnit: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
  },
  nutritionLabel: {
    fontSize: 11,
    color: COLORS.slate,
    fontWeight: '500',
    marginTop: 2,
  },
  nutritionUnavailable: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  nutritionUnavailableText: {
    color: COLORS.muted,
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Availability trend chart
  trendChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 8,
  },
  trendBarCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  trendBarCount: {
    fontSize: 11,
    color: COLORS.maroon,
    fontWeight: '600',
    height: 16,
  },
  trendBarTrack: {
    width: 24,
    height: 60,
    justifyContent: 'flex-end',
    backgroundColor: COLORS.offWhite,
    borderRadius: 4,
    overflow: 'hidden',
  },
  trendBar: {
    width: '100%',
    borderRadius: 4,
  },
  trendBarDay: {
    fontSize: 11,
    color: COLORS.slate,
    fontWeight: '500',
  },

  // Prediction
  predictionBox: {
    backgroundColor: COLORS.cream,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  predictionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  predictionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.maroon,
  },
  predictionNoData: {
    fontSize: 14,
    color: COLORS.muted,
    fontStyle: 'italic',
  },

  // Subscribe button
  subscribeBtn: {
    backgroundColor: COLORS.maroon,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  subscribeBtnActive: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.maroon,
  },
  subscribeBtnPressed: {
    opacity: 0.85,
  },
  subscribeBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  subscribeBtnTextActive: {
    color: COLORS.maroon,
  },

  // Rate button
  rateBtn: {
    backgroundColor: COLORS.maroon,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  rateBtnPressed: {
    opacity: 0.85,
  },
  rateBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },

  // Photo reviews
  photoCard: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  photoImage: {
    width: '100%',
    height: 200,
    backgroundColor: COLORS.border,
  },
  photoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoAuthor: {
    fontSize: 13,
    color: COLORS.slate,
    fontWeight: '500',
  },
  reportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportBtnText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
});
