import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Animated } from 'react-native';
import Auth from '../components/Auth';

const SignupScreen = ({ navigation }) => {
  const [scrollOffset] = useState(new Animated.Value(0));
  
  const buttonOpacity = scrollOffset.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const scrollToSignup = () => {
    // Scroll to the auth component
    this.scrollView.scrollToEnd({ animated: true });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        ref={ref => this.scrollView = ref}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollOffset } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Chadder</Text>
          <Text style={styles.subtitle}>Create a new account</Text>
        </View>
        
        <Auth type="signup" />
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Animated.View style={[styles.fab, { opacity: buttonOpacity }]}>
        <TouchableOpacity 
          style={styles.fabButton}
          onPress={scrollToSignup}
        >
          <Text style={styles.fabText}>Sign Up Now</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginVertical: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4263eb',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: {
    color: '#666',
  },
  link: {
    color: '#4263eb',
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    left: 20,
  },
  fabButton: {
    backgroundColor: '#4263eb',
    borderRadius: 25,
    padding: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SignupScreen; 