import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens (we'll create these next)
import DiscoverScreen from '../screens/DiscoverScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StreamScreen from '../screens/StreamScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import CreditsScreen from '../screens/CreditsScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';

// Import Tab Navigator
import TabNavigator from './TabNavigator';

const Stack = createStackNavigator();

// Auth navigator for unauthenticated users
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
  </Stack.Navigator>
);

// Main navigator for authenticated users
const MainStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="Tabs" 
      component={TabNavigator} 
      options={{ headerShown: false }}
    />
    <Stack.Screen name="Stream" component={StreamScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="Credits" component={CreditsScreen} />
    <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
  </Stack.Navigator>
);

// Main app navigator
const AppNavigator = ({ user }) => {
  return (
    <NavigationContainer>
      {user ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator; 