import React, { useState, useEffect } from "react";
import { Box, Heading, Flex, Text, Spinner, useToast } from "@chakra-ui/react";
import GameCard from "./GameCard";
import { fetchStreamers } from "../api/twitch";
import "../styles/Discover.css";

function Discover() {
  const [streamers, setStreamers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    const loadStreamers = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log("Fetching streamers for Discover page...");
        
        const result = await fetchStreamers();
        
        if (result && result.error) {
          console.error("Error fetching streamers:", result.message);
          setError(result.message || "Failed to load streamers. Please try again later.");
          toast({
            title: "Error loading streamers",
            description: result.message || "Could not load streamers at this time.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setStreamers([]);
        } else if (Array.isArray(result) && result.length > 0) {
          console.log(`Successfully loaded ${result.length} streamers`);
          setStreamers(result);
          setError(null);
        } else {
          console.warn("No streamers found or invalid response format");
          setError("No streamers available at this time. Please try again later.");
          setStreamers([]);
        }
      } catch (err) {
        console.error("Exception in loadStreamers:", err);
        setError("An unexpected error occurred. Please try again later.");
        setStreamers([]);
        toast({
          title: "Error",
          description: "Failed to load streamers. Please refresh the page or try again later.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadStreamers();
  }, [toast]);

  if (isLoading) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        minH="50vh"
        p={4}
      >
        <Spinner
          thickness="4px"
          speed="0.65s"
          emptyColor="gray.200"
          color="purple.500"
          size="xl"
        />
        <Text mt={4} fontSize="lg">
          Loading streamers...
        </Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        minH="50vh"
        p={4}
        textAlign="center"
      >
        <Heading as="h3" size="lg" mb={2} color="red.500">
          Oops!
        </Heading>
        <Text fontSize="lg" mb={4}>
          {error}
        </Text>
        <Text fontSize="md">
          Please try refreshing the page or check back later.
        </Text>
      </Flex>
    );
  }

  if (streamers.length === 0) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        minH="50vh"
        p={4}
        textAlign="center"
      >
        <Heading as="h3" size="lg" mb={2}>
          No Streamers Found
        </Heading>
        <Text fontSize="lg">
          We couldn't find any streamers at the moment. Please check back later.
        </Text>
      </Flex>
    );
  }

  return (
    <div>
      <Box maxW="1200px" mx="auto" pt={2} px={4}>
        <Heading as="h2" size="xl" mb={6} textAlign="center">
          Discover Streamers
        </Heading>

        <Flex
          wrap="wrap"
          justify="center"
          gap={4}
          className="discover-grid"
        >
          {streamers.map((streamer) => (
            <GameCard
              key={streamer.user_id || streamer.id}
              streamer={streamer}
            />
          ))}
        </Flex>
      </Box>
    </div>
  );
}

export default Discover; 