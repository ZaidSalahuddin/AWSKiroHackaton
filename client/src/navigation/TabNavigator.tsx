import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import TrendingScreen from '../screens/TrendingScreen';
import RecommendationsScreen from '../screens/RecommendationsScreen';
import SocialScreen from '../screens/SocialScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MenuItemDetailScreen from '../screens/MenuItemDetailScreen';
import RatingSubmissionScreen from '../screens/RatingSubmissionScreen';
import DietaryProfileScreen from '../screens/DietaryProfileScreen';
import NutritionalTrackingScreen from '../screens/NutritionalTrackingScreen';

export type RootTabParamList = {
  Home: undefined;
  Trending: undefined;
  Recommendations: undefined;
  Social: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  MenuItemDetail: { itemId: string };
  RatingSubmission: { menuItemId: string; menuItemName: string };
  DietaryProfile: undefined;
  NutritionalTracking: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Trending" component={TrendingScreen} />
      <Tab.Screen name="Recommendations" component={RecommendationsScreen} />
      <Tab.Screen name="Social" component={SocialScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="MenuItemDetail" component={MenuItemDetailScreen} />
      <Stack.Screen name="RatingSubmission" component={RatingSubmissionScreen} />
      <Stack.Screen
        name="DietaryProfile"
        component={DietaryProfileScreen}
        options={{ headerShown: true, title: 'Dietary Profile' }}
      />
      <Stack.Screen
        name="NutritionalTracking"
        component={NutritionalTrackingScreen}
        options={{ headerShown: true, title: 'Nutritional Tracking' }}
      />
    </Stack.Navigator>
  );
}
