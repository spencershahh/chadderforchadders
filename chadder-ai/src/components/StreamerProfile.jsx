import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Heading,
  Text,
  Image,
  Button,
  Flex,
  Link,
  Avatar,
  Badge,
  Spinner,
  useToast,
} from "@chakra-ui/react";
import { ArrowBackIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { fetchUserData } from "../api/twitch";

function StreamerProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [streamer, setStreamer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadStreamerData = async () => {
      if (!username) {
        setError("No username provided");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        console.log(`Loading profile data for ${username}...`);
        
        const userData = await fetchUserData(username);
        
        if (userData && userData.error) {
          console.error("Error fetching user data:", userData.message);
          setError(userData.message || "Failed to load streamer data. Please try again later.");
          toast({
            title: "Error loading streamer",
            description: userData.message || "Could not load streamer data at this time.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setStreamer(null);
        } else if (userData) {
          console.log(`Successfully loaded data for ${username}`);
          setStreamer(userData);
          setError(null);
        } else {
          console.warn(`No data found for ${username}`);
          setError(`Could not find streamer "${username}". Please check the username and try again.`);
          setStreamer(null);
        }
      } catch (err) {
        console.error(`Error in loadStreamerData for ${username}:`, err);
        setError("An unexpected error occurred. Please try again later.");
        setStreamer(null);
        toast({
          title: "Error",
          description: "Failed to load streamer data. Please refresh the page.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadStreamerData();
  }, [username, toast]);

  const goBack = () => {
    navigate(-1);
  };

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
          Loading streamer profile...
        </Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Box maxW="1200px" mx="auto" p={4}>
        <Button leftIcon={<ArrowBackIcon />} mb={4} onClick={goBack}>
          Back
        </Button>
        <Flex
          direction="column"
          align="center"
          justify="center"
          minH="40vh"
          p={4}
          textAlign="center"
        >
          <Heading as="h2" size="lg" mb={2} color="red.500">
            Oops!
          </Heading>
          <Text fontSize="lg" mb={4}>
            {error}
          </Text>
          <Text fontSize="md">
            Please try again or go back to discover other streamers.
          </Text>
        </Flex>
      </Box>
    );
  }

  if (!streamer) {
    return (
      <Box maxW="1200px" mx="auto" p={4}>
        <Button leftIcon={<ArrowBackIcon />} mb={4} onClick={goBack}>
          Back
        </Button>
        <Flex
          direction="column"
          align="center"
          justify="center"
          minH="40vh"
          p={4}
          textAlign="center"
        >
          <Heading as="h2" size="lg" mb={2}>
            Streamer Not Found
          </Heading>
          <Text fontSize="lg">
            We couldn't find the streamer "{username}". Please check the username and try again.
          </Text>
        </Flex>
      </Box>
    );
  }

  // Get normalized data
  const displayName = streamer.display_name || streamer.login || username;
  const description = streamer.description || "No bio available.";
  const profileImage = streamer.profile_image_url;
  const isPartnered = streamer.broadcaster_type === "partner";
  const isAffiliate = streamer.broadcaster_type === "affiliate";
  
  // Check if this is a fallback/error response
  if (!streamer.id && !streamer.login) {
    return (
      <Box maxW="1200px" mx="auto" p={4}>
        <Button leftIcon={<ArrowBackIcon />} mb={4} onClick={goBack}>
          Back
        </Button>
        <Flex
          direction="column"
          align="center"
          justify="center"
          minH="40vh"
          p={4}
          textAlign="center"
        >
          <Heading as="h2" size="lg" mb={2}>
            Data Unavailable
          </Heading>
          <Text fontSize="lg" mb={4}>
            Streamer data is currently unavailable. The Twitch API may be experiencing issues.
          </Text>
          <Text fontSize="md">
            Please try again later.
          </Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box maxW="1200px" mx="auto" p={4}>
      <Button leftIcon={<ArrowBackIcon />} mb={4} onClick={goBack}>
        Back
      </Button>

      <Flex
        direction={{ base: "column", md: "row" }}
        bg="#1f1f23"
        borderRadius="lg"
        overflow="hidden"
        boxShadow="xl"
      >
        <Box
          w={{ base: "100%", md: "300px" }}
          h={{ base: "300px", md: "auto" }}
          position="relative"
          bg="gray.800"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {profileImage ? (
            <Image
              src={profileImage}
              alt={displayName}
              objectFit="cover"
              h="100%"
              w="100%"
              fallbackSrc="https://via.placeholder.com/300x300/1a1a2e/FFFFFF?text=No+Image"
            />
          ) : (
            <Avatar
              size="2xl"
              name={displayName}
              bg="purple.500"
            />
          )}
        </Box>

        <Box p={6} flex="1">
          <Flex align="center" mb={4} gap={2} flexWrap="wrap">
            <Heading as="h1" size="xl" mr={2}>
              {displayName}
            </Heading>
            {isPartnered && (
              <Badge colorScheme="purple" variant="solid" px={2} py={1}>
                Partner
              </Badge>
            )}
            {isAffiliate && (
              <Badge colorScheme="teal" variant="solid" px={2} py={1}>
                Affiliate
              </Badge>
            )}
          </Flex>

          <Text fontSize="md" color="gray.300" mb={6} whiteSpace="pre-wrap">
            {description}
          </Text>

          <Flex mt={4} gap={4} flexWrap="wrap">
            <Link
              href={`https://twitch.tv/${username}`}
              isExternal
              _hover={{ textDecoration: "none" }}
            >
              <Button
                colorScheme="purple"
                rightIcon={<ExternalLinkIcon />}
                size="md"
              >
                Watch on Twitch
              </Button>
            </Link>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
}

export default StreamerProfile; 