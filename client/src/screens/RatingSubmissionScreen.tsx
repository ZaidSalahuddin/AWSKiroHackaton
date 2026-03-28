/**
 * RatingSubmissionScreen — VT Dining Ranker
 *
 * Implements:
 *  - Star-rating UI (1–5 stars)
 *  - Check-in confirmation prompt (if no check-in within 90 min)
 *  - Optional photo attachment (JPEG/PNG, ≤10 MB) with validation error
 *  - Disable submit + "Already rated" message when 409 returned
 *  - Requirements: 2.1, 2.4, 2.6, 11.1, 11.2
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import apiClient from '../api/client';

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = {
  maroon: '#861F41',
  maroonDark: '#5C1530',
  maroonDeep: '#3D0E22',
  orange: '#E5751F',
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
  starActive: '#E5751F',
  starInactive: '#D9C9BC',
  disabledBg: '#E8DDD5',
  disabledText: '#A89080',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectedPhoto {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface RouteParams {
  menuItemId: string;
  menuItemName: string;
}

interface Props {
  route: { params: RouteParams };
  navigation: { goBack: () => void };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
}

function StarRating({ value, onChange, disabled }: StarRatingProps) {
  return (
    <View
      style={styles.starsRow}
      accessibilityLabel={`Star rating: ${value} out of 5 selected`}
      accessibilityRole="adjustable"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => !disabled && onChange(star)}
          disabled={disabled}
          style={({ pressed }) => [
            styles.starBtn,
            pressed && !disabled && styles.starBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
          accessibilityState={{ selected: value >= star, disabled: !!disabled }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[styles.starIcon, value >= star ? styles.starActive : styles.starInactive]}>
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validatePhoto(photo: SelectedPhoto): string | null {
  const ext = photo.fileName.toLowerCase().slice(photo.fileName.lastIndexOf('.'));
  const mimeOk = ACCEPTED_MIME_TYPES.includes(photo.mimeType);
  const extOk = ACCEPTED_EXTENSIONS.includes(ext);

  if (!mimeOk && !extOk) {
    return 'Only JPEG and PNG images are accepted.';
  }
  if (photo.fileSize > MAX_PHOTO_BYTES) {
    return `Photo must be 10 MB or smaller (selected: ${(photo.fileSize / 1024 / 1024).toFixed(1)} MB).`;
  }
  return null;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RatingSubmissionScreen({ route, navigation }: Props) {
  const { menuItemId, menuItemName } = route.params;

  const [stars, setStars] = useState(0);
  const [confirmedConsumed, setConfirmedConsumed] = useState(false);
  const [showConfirmPrompt, setShowConfirmPrompt] = useState(false);
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  // ── Photo picker ───────────────────────────────────────────────────────────

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library to attach a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      // Return file info so we can validate size/type
      exif: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? 'photo.jpg';
    const mimeType = asset.mimeType ?? (fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    const fileSize = asset.fileSize ?? 0;

    const selected: SelectedPhoto = { uri: asset.uri, fileName, mimeType, fileSize };
    const error = validatePhoto(selected);
    setPhotoError(error);
    setPhoto(error ? null : selected);
  }, []);

  const removePhoto = useCallback(() => {
    setPhoto(null);
    setPhotoError(null);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      Alert.alert('Select a rating', 'Please choose 1–5 stars before submitting.');
      return;
    }

    // If user hasn't confirmed consumption yet, show the prompt first
    if (!confirmedConsumed) {
      setShowConfirmPrompt(true);
      return;
    }

    await doSubmit();
  }, [stars, confirmedConsumed]);

  const doSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      // POST /api/ratings
      const ratingRes = await apiClient.post<{ id: string }>('/api/ratings', {
        menuItemId,
        stars,
        confirmedConsumed: true,
      });

      const ratingId = ratingRes.data.id;

      // Upload photo if attached
      if (photo) {
        const formData = new FormData();
        formData.append('photo', {
          uri: photo.uri,
          name: photo.fileName,
          type: photo.mimeType,
        } as unknown as Blob);

        await apiClient.post(`/api/ratings/${ratingId}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      Alert.alert('Rating submitted!', 'Thanks for your feedback.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      const status = axiosErr?.response?.status;
      const errorCode = axiosErr?.response?.data?.error;

      if (status === 409 || errorCode === 'already_rated') {
        setAlreadyRated(true);
      } else if (status === 400 && errorCode === 'check_in_required') {
        // Should not happen since we always send confirmedConsumed: true, but handle gracefully
        Alert.alert('Check-in required', 'Please confirm you consumed this item.');
      } else {
        Alert.alert('Error', 'Could not submit your rating. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [menuItemId, stars, photo, navigation]);

  const onConfirmConsumed = useCallback(async () => {
    setConfirmedConsumed(true);
    setShowConfirmPrompt(false);
    await doSubmit();
  }, [doSubmit]);

  const onCancelConfirm = useCallback(() => {
    setShowConfirmPrompt(false);
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const canSubmit = stars > 0 && !submitting && !alreadyRated;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.maroonDeep} />

      {/* Header */}
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Rate Item</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Item name */}
        <View style={styles.itemNameCard}>
          <Text style={styles.itemNameLabel}>RATING FOR</Text>
          <Text style={styles.itemName} accessibilityRole="header">{menuItemName}</Text>
        </View>

        {/* Already rated banner */}
        {alreadyRated && (
          <View
            style={styles.alreadyRatedBanner}
            accessibilityRole="alert"
            accessibilityLabel="Already rated: you have already rated this item this meal period"
          >
            <Text style={styles.alreadyRatedIcon}>✓</Text>
            <Text style={styles.alreadyRatedText}>
              Already rated — you can only rate this item once per meal period.
            </Text>
          </View>
        )}

        {/* Star rating */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR RATING</Text>
          <StarRating value={stars} onChange={setStars} disabled={alreadyRated} />
          {stars > 0 && (
            <Text style={styles.starHint} accessibilityLiveRegion="polite">
              {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][stars]}
            </Text>
          )}
        </View>

        {/* Check-in confirmation prompt */}
        {showConfirmPrompt && (
          <View
            style={styles.confirmCard}
            accessibilityRole="alert"
            accessibilityLabel="Check-in confirmation required"
          >
            <Text style={styles.confirmTitle}>Did you consume this item?</Text>
            <Text style={styles.confirmBody}>
              We couldn't verify a recent check-in at this dining hall. Please confirm you actually ate this item before submitting your rating.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={onCancelConfirm}
                style={styles.confirmCancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel rating submission"
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onConfirmConsumed}
                style={styles.confirmYesBtn}
                accessibilityRole="button"
                accessibilityLabel="Yes, I consumed this item"
              >
                <Text style={styles.confirmYesText}>Yes, I ate it</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Photo attachment */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PHOTO (OPTIONAL)</Text>
          <Text style={styles.photoHint}>JPEG or PNG, max 10 MB</Text>

          {photoError && (
            <View
              style={styles.photoErrorBox}
              accessibilityRole="alert"
              accessibilityLabel={`Photo error: ${photoError}`}
            >
              <Text style={styles.photoErrorText}>⚠ {photoError}</Text>
            </View>
          )}

          {photo ? (
            <View style={styles.photoPreviewContainer}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.photoPreview}
                resizeMode="cover"
                accessibilityLabel="Selected photo preview"
              />
              <Pressable
                onPress={removePhoto}
                style={styles.removePhotoBtn}
                accessibilityRole="button"
                accessibilityLabel="Remove selected photo"
              >
                <Text style={styles.removePhotoBtnText}>✕ Remove</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={pickPhoto}
              style={({ pressed }) => [
                styles.photoPickerBtn,
                pressed && styles.photoPickerBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Attach a photo to your rating"
              accessibilityHint="Opens your photo library to select a JPEG or PNG image under 10 MB"
            >
              <Text style={styles.photoPickerIcon}>📷</Text>
              <Text style={styles.photoPickerText}>Attach Photo</Text>
            </Pressable>
          )}
        </View>

        {/* Submit button */}
        <View style={styles.submitSection}>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              !canSubmit && styles.submitBtnDisabled,
              pressed && canSubmit && styles.submitBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={alreadyRated ? 'Already rated this item' : 'Submit rating'}
            accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextDisabled]}>
                {alreadyRated ? 'Already Rated' : 'Submit Rating'}
              </Text>
            )}
          </Pressable>

          {stars === 0 && !alreadyRated && (
            <Text style={styles.submitHint}>Select a star rating to continue</Text>
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
    paddingBottom: 48,
  },

  // Header
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
  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },

  // Item name card
  itemNameCard: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemNameLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.charcoal,
    lineHeight: 26,
  },

  // Already rated banner
  alreadyRatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.openGreen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    marginTop: 8,
  },
  alreadyRatedIcon: {
    fontSize: 18,
    color: COLORS.openGreen,
  },
  alreadyRatedText: {
    flex: 1,
    color: COLORS.openGreen,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  // Sections
  section: {
    backgroundColor: COLORS.white,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 20,
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
    marginBottom: 16,
  },

  // Stars
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  starBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  starBtnPressed: {
    backgroundColor: 'rgba(229,117,31,0.1)',
  },
  starIcon: {
    fontSize: 40,
  },
  starActive: {
    color: COLORS.starActive,
  },
  starInactive: {
    color: COLORS.starInactive,
  },
  starHint: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.maroon,
  },

  // Check-in confirmation card
  confirmCard: {
    backgroundColor: COLORS.cream,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.charcoal,
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 14,
    color: COLORS.slate,
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.slate,
  },
  confirmYesBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.maroon,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  confirmYesText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Photo
  photoHint: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 14,
    marginTop: -8,
  },
  photoErrorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  photoErrorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
  photoPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.maroon,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 18,
    minHeight: 44,
  },
  photoPickerBtnPressed: {
    backgroundColor: 'rgba(134,31,65,0.05)',
  },
  photoPickerIcon: {
    fontSize: 22,
  },
  photoPickerText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.maroon,
  },
  photoPreviewContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    backgroundColor: COLORS.border,
  },
  removePhotoBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.offWhite,
    minHeight: 44,
    justifyContent: 'center',
  },
  removePhotoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.closedRed,
  },

  // Submit
  submitSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    alignItems: 'center',
    gap: 10,
  },
  submitBtn: {
    width: '100%',
    backgroundColor: COLORS.maroon,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: COLORS.disabledBg,
  },
  submitBtnPressed: {
    opacity: 0.85,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  submitBtnTextDisabled: {
    color: COLORS.disabledText,
  },
  submitHint: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
});
