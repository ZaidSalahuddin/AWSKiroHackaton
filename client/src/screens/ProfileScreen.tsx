import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => navigation.navigate('DietaryProfile')}
        accessibilityRole="button"
        accessibilityLabel="Edit dietary profile"
      >
        <Text style={styles.btnText}>🥗  Dietary Profile</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.btnPressed]}
        onPress={() => navigation.navigate('NutritionalTracking')}
        accessibilityRole="button"
        accessibilityLabel="Nutritional tracking"
      >
        <Text style={styles.btnText}>📊  Nutritional Tracking</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDF6F0', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#861F41', marginBottom: 32 },
  btn: {
    backgroundColor: '#861F41',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnSecondary: { backgroundColor: '#E5751F' },
  btnPressed: { opacity: 0.8 },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
