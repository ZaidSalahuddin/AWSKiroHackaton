/**
 * TrendingScreen — VT Dining Ranker
 *
 * Displays:
 *  - Top-10 trending menu items (name, dining hall, recency score, 60-min rating count)
 *  - "Not enough activity yet" when insufficient_activity is true
 *  - "Special Event" badge for event specials
 *  - Auto-refresh via WebSocket every 60 s (channel: 'trending')
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 15.2, 15.4
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

import apiClient from '../api/client';
import wsClient from '../websocket/wsClient';
import type { TrendingItem, TrendingFeedResponse, WsServerMessage } from '../types';

// ── Palette (matches HomeScreen / MenuItemDetailScreen) ───────────────────────

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
  cardBg: '#FFFFFF',
  gold: '#B8860B',
  silver: '#708090',
  bronze: '#8B4513',
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface RankMedalProps {
  rank: number;
}

function RankMedal({ rank }: RankMedalProps) {
  let bg = COLORS.maroon;
  if (rank === 1) bg = COLORS.gold;
  else if (rank === 2) bg = COLORS.silver;
  else if (rank === 3) bg = COLORS.bronze;

  return (
    <View style={[styles.rankBadge, { backgroundColor: bg }]}>
      <Text style={styles.rankText}>{rank}</Text>
    </View>
  );
}

interface TrendingItemCardProps {
  item: TrendingItem;
  rank: number;
  onPress?: () => void;
}

function TrendingItemCard({ item, rank, onPress }: TrendingItemCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, item.isEventSpecial && styles.cardSpecial]}
        accessibilityRole="button"
        accessibilityLabel={[
          `Rank ${rank}: ${item.name}`,
          `at ${item.diningHall}`,
          `recency score ${item.recencyScore.toFixed(1)}`,
          `${item.ratingCount60min} rating${item.ratingCount60min !== 1 ? 's' : ''} in the past 60 minutes`,
          item.isEventSpecial ? 'Special Event' : '',
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {/* Left: rank + info */}
        <View style={styles.cardLeft}>
          <RankMedal rank={rank} />
          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isEventSpecial && (
                <View
                  style={styles.specialBadge}
                  accessibilityLabel="Special Event"
                >
                  <Text style={styles.specialBadgeText}>★ SPECIAL EVENT</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardDiningHall} numberOfLines={1}>
              {item.diningHall}
            </Text>
          </View>
        </View>

        {/* Right: scores */}
        <View style={styles.cardRight}>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreValue}>{item.recencyScore.toFixed(1)}</Text>
            <Text style={styles.scoreLabel}>score</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreBlock}>
            <Text style={styles.ratingCountValue}>{item.ratingCount60min}</Text>
            <Text style={styles.scoreLabel}>ratings/hr</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Countdown indicator ───────────────────────────────────────────────────────

interface RefreshCountdownProps {
  secondsUntilRefresh: number;
}

function RefreshCountdown({ secondsUntilRefresh }: RefreshCountdownProps) {
  const progress = secondsUntilRefresh / 60;
  const width = `${Math.round(progress * 100)}%` as `${number}%`;

  return (
    <View
      style={styles.countdownContainer}
      accessibilityLabel={`Auto-refreshes in ${secondsUntilRefresh} seconds`}
    >
      <Text style={styles.countdownText}>
        Refreshes in {secondsUntilRefresh}s
      </Text>
      <View style={styles.countdownTrack}>
        <View style={[styles.countdownBar, { width }]} />
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

interface Props {
  navigation?: {
    navigate: (screen: string, params: Record<string, unknown>) => void;
  };
}

export default function TrendingScreen({ navigation }: Props) {
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [insufficientActivity, setInsufficientActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(60);

  // Fade-in animation for list updates
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadTrending = useCallback(async () => {
    try {
      const res = await apiClient.get<TrendingFeedResponse>('/api/trending');
      setItems(res.data.items ?? []);
      setInsufficientActivity(res.data.insufficientActivity ?? false);
    } catch {
      // Keep existing data on error; don't clear the feed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

  // ── WebSocket subscription ─────────────────────────────────────────────────

  useEffect(() => {
    wsClient.connect();
    wsClient.subscribe('trending');

    const unsub = wsClient.onMessage((msg: WsServerMessage) => {
      if (msg.channel !== 'trending') return;
      const payload = msg.data as TrendingFeedResponse;
      if (!payload) return;

      // Animate the update in
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.4,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setItems(payload.items ?? []);
      setInsufficientActivity(payload.insufficientActivity ?? false);
      setSecondsUntilRefresh(60); // reset countdown
    });

    return () => {
      wsClient.unsubscribe('trending');
      unsub();
    };
  }, [fadeAnim]);

  // ── Countdown timer ────────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsUntilRefresh((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Pull-to-refresh ────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSecondsUntilRefresh(60);
    loadTrending();
  }, [loadTrending]);

  // ── Item press ─────────────────────────────────────────────────────────────

  const handleItemPress = useCallback(
    (item: TrendingItem) => {
      if (item.id && navigation) {
        navigation.navigate('MenuItemDetail', { itemId: item.id });
      }
    },
    [navigation],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={styles.loadingContainer}
        accessibilityLabel="Loading trending feed"
      >
        <ActivityIndicator size="large" color={COLORS.maroon} />
        <Text style={styles.loadingText}>Loading trending items…</Text>
      </View>
    );
  }

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
            <Text style={styles.headerTitle}>Trending Now</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>🔥 TOP 10</Text>
          </View>
        </View>

        {/* ── Countdown bar ── */}
        <View style={styles.countdownWrapper}>
          <RefreshCountdown secondsUntilRefresh={secondsUntilRefresh} />
        </View>

        {/* ── Feed ── */}
        <View style={styles.feedSection}>
          <Text style={styles.sectionLabel}>TRENDING ITEMS · PAST 60 MIN</Text>

          {insufficientActivity ? (
            <View
              style={styles.emptyState}
              accessibilityRole="alert"
              accessibilityLabel="Not enough activity yet"
            >
              <Text style={styles.emptyStateIcon}>📊</Text>
              <Text style={styles.emptyStateTitle}>Not enough activity yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                Check back soon — the feed updates as students rate items.
              </Text>
            </View>
          ) : items.length === 0 ? (
            <View
              style={styles.emptyState}
              accessibilityRole="alert"
              accessibilityLabel="Not enough activity yet"
            >
              <Text style={styles.emptyStateIcon}>📊</Text>
              <Text style={styles.emptyStateTitle}>Not enough activity yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                Check back soon — the feed updates as students rate items.
              </Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: fadeAnim }}>
              {items.slice(0, 10).map((item, idx) => (
                <TrendingItemCard
                  key={item.id ?? `${item.name}-${idx}`}
                  item={item}
                  rank={idx + 1}
                  onPress={() => handleItemPress(item)}
                />
              ))}
            </Animated.View>
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
  headerBadge: {
    backgroundColor: COLORS.orange,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },

  // Countdown
  countdownWrapper: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countdownContainer: {
    gap: 6,
  },
  countdownText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  countdownTrack: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  countdownBar: {
    height: '100%',
    backgroundColor: COLORS.maroon,
    borderRadius: 2,
  },

  // Feed section
  feedSection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: COLORS.maroon,
    marginBottom: 12,
  },

  // Trending item card
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 12,
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
  cardSpecial: {
    borderColor: COLORS.orange,
    backgroundColor: '#FFFAF5',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.orange,
        shadowOpacity: 0.12,
      },
      android: { elevation: 2 },
    }),
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.charcoal,
    flexShrink: 1,
  },
  cardDiningHall: {
    fontSize: 12,
    color: COLORS.slate,
    fontWeight: '500',
  },

  // Special event badge
  specialBadge: {
    backgroundColor: COLORS.orange,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  specialBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 0.5,
  },

  // Rank badge
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.white,
  },

  // Score columns
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  scoreBlock: {
    alignItems: 'center',
    minWidth: 44,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.maroon,
    lineHeight: 20,
  },
  ratingCountValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.orange,
    lineHeight: 20,
  },
  scoreLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  scoreDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 8,
  },
  emptyStateIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.charcoal,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
