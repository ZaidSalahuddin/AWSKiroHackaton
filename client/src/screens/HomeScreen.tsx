/**
 * HomeScreen — VT Dining Ranker
 *
 * Displays:
 *  - Current weather (temp + conditions) with stale indicator
 *  - Hokie Passport balance with low-balance warning
 *  - Stale-menu banner when cached data is served
 *  - List of dining halls (open/closed, meal period, wait time)
 *  - Top-ranked menu items per hall (sorted by recency_score, live via WebSocket)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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

import {
  fetchDiningHalls,
  fetchHokiePassportBalance,
  fetchRankedItems,
  fetchWeather,
  RankedMenuResponse,
} from '../api/apiHelpers';
import wsClient from '../websocket/wsClient';
import {
  DiningHall,
  HokiePassportBalance,
  MenuItem,
  MealPeriod,
  WeatherData,
  WsServerMessage,
} from '../types';

// ── Palette ───────────────────────────────────────────────────────────────────

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
  staleBlue: '#2563EB',
  cardBg: '#FFFFFF',
  hallBg: '#FFF9F5',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  late_night: 'Late Night',
};

function weatherIcon(conditions: string): string {
  const c = conditions.toLowerCase();
  if (c.includes('snow')) return '❄️';
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
  if (c.includes('thunder') || c.includes('storm')) return '⛈️';
  if (c.includes('cloud') || c.includes('overcast')) return '☁️';
  if (c.includes('fog') || c.includes('mist')) return '🌫️';
  if (c.includes('clear') || c.includes('sunny')) return '☀️';
  return '🌤️';
}

function formatWaitTime(hall: DiningHall): string {
  if (!hall.isOpen) return 'Closed';
  const wt = hall.waitTime;
  if (!wt || wt.unknown || wt.minutes === null) return 'Wait unknown';
  return `~${wt.minutes} min wait`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StaleBannerProps {
  message: string;
  color?: string;
}

function StaleBanner({ message, color = COLORS.staleBlue }: StaleBannerProps) {
  return (
    <View
      style={[styles.staleBanner, { backgroundColor: color + '18', borderColor: color + '40' }]}
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <Text style={[styles.staleBannerText, { color }]}>⚠ {message}</Text>
    </View>
  );
}

interface WeatherCardProps {
  weather: WeatherData;
}

function WeatherCard({ weather }: WeatherCardProps) {
  const icon = weatherIcon(weather.conditions);
  return (
    <View
      style={styles.weatherCard}
      accessibilityLabel={`Current weather: ${Math.round(weather.temperature_f)} degrees Fahrenheit, ${weather.conditions}`}
    >
      <Text style={styles.weatherIcon}>{icon}</Text>
      <View>
        <Text style={styles.weatherTemp}>{Math.round(weather.temperature_f)}°F</Text>
        <Text style={styles.weatherConditions}>{weather.conditions}</Text>
      </View>
      {weather.stale && (
        <View style={styles.weatherStaleTag} accessibilityLabel="Weather data may be outdated">
          <Text style={styles.weatherStaleText}>Outdated</Text>
        </View>
      )}
    </View>
  );
}

interface BalanceCardProps {
  balance: HokiePassportBalance;
}

function BalanceCard({ balance }: BalanceCardProps) {
  return (
    <View
      style={[
        styles.balanceCard,
        balance.lowBalanceWarning && styles.balanceCardWarning,
      ]}
      accessibilityLabel={`Hokie Passport: ${balance.mealSwipesRemaining} meal swipes remaining, $${balance.diningDollarsBalance.toFixed(2)} dining dollars${balance.lowBalanceWarning ? '. Low balance warning.' : ''}`}
    >
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>🍽 Meal Swipes</Text>
        <View style={styles.balanceValueRow}>
          <Text style={styles.balanceValue}>{balance.mealSwipesRemaining}</Text>
          {balance.lowBalanceWarning && (
            <View
              style={styles.lowBalanceBadge}
              accessibilityLabel="Low balance warning"
            >
              <Text style={styles.lowBalanceBadgeText}>LOW</Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.balanceDivider, balance.lowBalanceWarning && styles.balanceDividerWarning]} />
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>💵 Dining Dollars</Text>
        <Text style={styles.balanceValue}>${balance.diningDollarsBalance.toFixed(2)}</Text>
      </View>
      {balance.stale && (
        <Text style={styles.balanceStaleText} accessibilityLabel="Balance may be outdated">
          Balance may be outdated
        </Text>
      )}
    </View>
  );
}

interface MenuItemRowProps {
  item: MenuItem;
  rank: number;
  key?: React.Key;
}

function MenuItemRow({ item, rank }: MenuItemRowProps) {
  const isSpecial = item.isEventSpecial;
  return (
    <View
      style={[styles.menuItemRow, isSpecial && styles.menuItemRowSpecial]}
      accessibilityLabel={`Rank ${rank}: ${item.name}${isSpecial ? ', special event item' : ''}${item.healthScore != null ? `, health score ${item.healthScore}` : ''}`}
    >
      <View style={styles.menuItemRankBadge}>
        <Text style={styles.menuItemRank}>{rank}</Text>
      </View>
      <View style={styles.menuItemInfo}>
        <View style={styles.menuItemNameRow}>
          <Text style={styles.menuItemName} numberOfLines={1}>{item.name}</Text>
          {isSpecial && (
            <View style={styles.specialBadge} accessibilityLabel="Special event item">
              <Text style={styles.specialBadgeText}>★ SPECIAL</Text>
            </View>
          )}
        </View>
        <Text style={styles.menuItemStation} numberOfLines={1}>{item.station}</Text>
      </View>
      <View style={styles.menuItemScoreCol}>
        {item.healthScore != null && (
          <View style={styles.healthScoreBadge}>
            <Text style={styles.healthScoreText}>{item.healthScore.toFixed(1)}</Text>
          </View>
        )}
        <Text style={styles.recencyScore}>{item.recencyScore.toFixed(1)}</Text>
        <Text style={styles.recencyLabel}>score</Text>
      </View>
    </View>
  );
}

interface DiningHallCardProps {
  hall: DiningHall;
  rankedItems: MenuItem[];
  stale: boolean;
  expanded: boolean;
  onToggle: () => void;
  key?: React.Key;
}

function DiningHallCard({ hall, rankedItems, stale, expanded, onToggle }: DiningHallCardProps) {
  const rotateAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotateAnim]);

  const arrowRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const waitLabel = formatWaitTime(hall);
  const mealLabel = hall.currentMealPeriod
    ? MEAL_PERIOD_LABELS[hall.currentMealPeriod]
    : null;

  return (
    <View style={styles.hallCard}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }: { pressed: boolean }) => [styles.hallHeader, pressed && styles.hallHeaderPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${hall.name}, ${hall.isOpen ? 'open' : 'closed'}${mealLabel ? `, ${mealLabel}` : ''}. ${waitLabel}. Tap to ${expanded ? 'collapse' : 'expand'} menu.`}
        accessibilityState={{ expanded }}
      >
        {/* Status dot */}
        <View style={[styles.statusDot, { backgroundColor: hall.isOpen ? COLORS.openGreen : COLORS.closedRed }]} />

        <View style={styles.hallHeaderContent}>
          <View style={styles.hallTitleRow}>
            <Text style={styles.hallName}>{hall.name}</Text>
            <View style={[styles.openBadge, { backgroundColor: hall.isOpen ? COLORS.openGreen + '18' : COLORS.closedRed + '18' }]}>
              <Text style={[styles.openBadgeText, { color: hall.isOpen ? COLORS.openGreen : COLORS.closedRed }]}>
                {hall.isOpen ? 'OPEN' : 'CLOSED'}
              </Text>
            </View>
          </View>

          <View style={styles.hallMetaRow}>
            {mealLabel && (
              <View style={styles.mealPeriodTag}>
                <Text style={styles.mealPeriodText}>{mealLabel}</Text>
              </View>
            )}
            <Text style={[
              styles.waitTimeText,
              !hall.isOpen && styles.waitTimeTextClosed,
            ]}>
              {waitLabel}
            </Text>
          </View>
        </View>

        <Animated.Text style={[styles.chevron, { transform: [{ rotate: arrowRotate }] }]}>
          ▾
        </Animated.Text>
      </Pressable>

      {expanded && (
        <View style={styles.hallBody}>
          {stale && (
            <StaleBanner message="Menu data may be cached" color={COLORS.staleBlue} />
          )}
          {!hall.isOpen ? (
            <Text style={styles.hallClosedMsg} accessibilityLabel={`${hall.name} is currently closed`}>
              This dining hall is currently closed.
            </Text>
          ) : rankedItems.length === 0 ? (
            <Text style={styles.hallClosedMsg} accessibilityLabel="Menu unavailable">
              Menu unavailable
            </Text>
          ) : (
            <>
              <Text style={styles.rankedHeader}>Top Ranked Items</Text>
              {rankedItems.slice(0, 5).map((item, idx) => (
                <MenuItemRow key={item.id} item={item} rank={idx + 1} />
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

interface HallRankings {
  [hallId: string]: { items: MenuItem[]; stale: boolean };
}

export default function HomeScreen() {
  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [hallsStale, setHallsStale] = useState(false);
  const [rankings, setRankings] = useState<HallRankings>({});
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [balance, setBalance] = useState<HokiePassportBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedHalls, setExpandedHalls] = useState<Set<string>>(new Set());

  // ── Data fetching ────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    try {
      const [hallsRes, weatherRes] = await Promise.allSettled([
        fetchDiningHalls(),
        fetchWeather(),
      ]);

      if (hallsRes.status === 'fulfilled') {
        setHalls(hallsRes.value.halls);
        setHallsStale(!!hallsRes.value.stale);

        // Fetch ranked items for each hall in parallel
        const rankingResults = await Promise.allSettled(
          hallsRes.value.halls.map((h: DiningHall) => fetchRankedItems(h.id)),
        );
        const newRankings: HallRankings = {};
        hallsRes.value.halls.forEach((h: DiningHall, i: number) => {
          const r = rankingResults[i];
          if (r.status === 'fulfilled') {
            const fulfilled = r as PromiseFulfilledResult<RankedMenuResponse>;
            newRankings[h.id] = { items: fulfilled.value.items, stale: !!fulfilled.value.stale };
          } else {
            newRankings[h.id] = { items: [], stale: false };
          }
        });
        setRankings(newRankings);

        // Auto-expand first open hall
        const firstOpen = hallsRes.value.halls.find((h: DiningHall) => h.isOpen);
        if (firstOpen) {
          setExpandedHalls(new Set([firstOpen.id]));
        }
      }

      if (weatherRes.status === 'fulfilled') {
        setWeather(weatherRes.value);
      }

      // Balance fetch (non-critical — may fail if not connected)
      try {
        const bal = await fetchHokiePassportBalance();
        setBalance(bal);
      } catch {
        // Not connected or unavailable — silently skip
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── WebSocket subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    if (halls.length === 0) return;

    wsClient.connect();

    // Subscribe to rankings channel for each hall
    halls.forEach((h: DiningHall) => wsClient.subscribe(`rankings:${h.id}`));

    const unsubscribe = wsClient.onMessage((msg: WsServerMessage) => {
      if (msg.type !== 'update' && msg.type !== 'replay') return;
      const match = msg.channel.match(/^rankings:(.+)$/);
      if (!match) return;
      const hallId = match[1];
      const payload = msg.data as RankedMenuResponse;
      if (payload?.items) {
        setRankings((prev: HallRankings) => ({
          ...prev,
          [hallId]: { items: payload.items, stale: !!payload.stale },
        }));
      }
    });

    return () => {
      halls.forEach((h: DiningHall) => wsClient.unsubscribe(`rankings:${h.id}`));
      unsubscribe();
    };
  }, [halls]);

  // ── Interactions ─────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const toggleHall = useCallback((hallId: string) => {
    setExpandedHalls((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(hallId)) {
        next.delete(hallId);
      } else {
        next.add(hallId);
      }
      return next;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel="Loading dining information">
        <ActivityIndicator size="large" color={COLORS.maroon} />
        <Text style={styles.loadingText}>Loading dining halls…</Text>
      </View>
    );
  }

  const anyMenuStale =
    (Object.values(rankings) as Array<{ items: MenuItem[]; stale: boolean }>).some(
      (r) => r.stale,
    ) || hallsStale;

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
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>VIRGINIA TECH</Text>
            <Text style={styles.headerTitle}>Dining Ranker</Text>
          </View>
          {weather && <WeatherCard weather={weather} />}
        </View>

        {/* ── Global stale banner ── */}
        {anyMenuStale && (
          <StaleBanner message="Some menu data is cached and may not reflect the latest changes." />
        )}

        {/* ── Hokie Passport Balance ── */}
        {balance && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>HOKIE PASSPORT</Text>
            <BalanceCard balance={balance} />
          </View>
        )}

        {/* ── Dining Halls ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DINING HALLS</Text>
          {halls.length === 0 ? (
            <Text style={styles.emptyText} accessibilityLabel="No dining hall data available">
              No dining hall data available.
            </Text>
          ) : (
            halls.map((hall: DiningHall) => (
              <DiningHallCard
                key={hall.id}
                hall={hall}
                rankedItems={rankings[hall.id]?.items ?? []}
                stale={rankings[hall.id]?.stale ?? false}
                expanded={expandedHalls.has(hall.id)}
                onToggle={() => toggleHall(hall.id)}
              />
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
    paddingBottom: 32,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.offWhite,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: COLORS.slate,
    fontWeight: '500',
  },

  // Header
  header: {
    backgroundColor: COLORS.maroonDeep,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.orange,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
    lineHeight: 36,
  },

  // Weather card (in header)
  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  weatherIcon: {
    fontSize: 22,
  },
  weatherTemp: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
    lineHeight: 22,
  },
  weatherConditions: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  weatherStaleTag: {
    backgroundColor: COLORS.warningAmber + '30',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.warningAmber + '60',
  },
  weatherStaleText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.warningAmber,
    letterSpacing: 0.5,
  },

  // Stale banner
  staleBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  staleBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Section
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: COLORS.maroon,
    marginBottom: 10,
  },

  // Balance card
  balanceCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.maroon,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  balanceCardWarning: {
    borderColor: COLORS.warningAmber,
    backgroundColor: '#FFFBF0',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 13,
    color: COLORS.slate,
    fontWeight: '500',
  },
  balanceValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.charcoal,
  },
  lowBalanceBadge: {
    backgroundColor: COLORS.warningAmber,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lowBalanceBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1,
  },
  balanceDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  balanceDividerWarning: {
    backgroundColor: COLORS.warningAmber + '40',
  },
  balanceStaleText: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Dining hall card
  hallCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  hallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: COLORS.hallBg,
  },
  hallHeaderPressed: {
    backgroundColor: COLORS.cream,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  hallHeaderContent: {
    flex: 1,
    gap: 4,
  },
  hallTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hallName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.charcoal,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  openBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  openBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hallMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealPeriodTag: {
    backgroundColor: COLORS.maroon + '15',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mealPeriodText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.maroon,
    letterSpacing: 0.3,
  },
  waitTimeText: {
    fontSize: 12,
    color: COLORS.slate,
    fontWeight: '500',
  },
  waitTimeTextClosed: {
    color: COLORS.muted,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.muted,
    flexShrink: 0,
  },

  // Hall body (expanded)
  hallBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  hallClosedMsg: {
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
    paddingVertical: 10,
    textAlign: 'center',
  },
  rankedHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.maroon,
    marginTop: 10,
    marginBottom: 6,
  },

  // Menu item row
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  menuItemRowSpecial: {
    backgroundColor: COLORS.orange + '0A',
  },
  menuItemRankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.maroon,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuItemRank: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.white,
  },
  menuItemInfo: {
    flex: 1,
    gap: 2,
  },
  menuItemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  menuItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.charcoal,
    flexShrink: 1,
  },
  specialBadge: {
    backgroundColor: COLORS.orange,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  specialBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  menuItemStation: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '500',
  },
  menuItemScoreCol: {
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
  },
  healthScoreBadge: {
    backgroundColor: COLORS.openGreen + '20',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: COLORS.openGreen + '40',
  },
  healthScoreText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.openGreen,
  },
  recencyScore: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.maroon,
  },
  recencyLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Empty state
  emptyText: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
