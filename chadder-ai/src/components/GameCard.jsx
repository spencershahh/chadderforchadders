import React from "react";
import { Box, Image, Heading, Text, Badge, Link, Avatar } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import formatViewers from "../utils/formatViewers";

function GameCard({ streamer }) {
  // Validate streamer data before rendering
  if (!streamer || typeof streamer !== 'object') {
    console.error('Invalid streamer data provided to GameCard:', streamer);
    return null;
  }

  // Normalize streamer data with fallbacks for everything
  const username = streamer.user_login || streamer.user_name || streamer.username || streamer.login || "unknown";
  const displayName = streamer.user_name || streamer.display_name || username || "Unknown Streamer";
  const type = streamer.type || "offline";
  const isLive = type === "live";
  const viewerCount = Number(streamer.viewer_count) || 0;
  const gameName = streamer.game_name || streamer.game || "Unknown Game";
  const streamTitle = streamer.title || "No title";
  
  // Get profile image if available
  const profileImage = streamer.profile_image_url || streamer.profile_image || null;
  
  // Safely process thumbnail URL
  const getThumbnailUrl = () => {
    if (!streamer.thumbnail_url) return null;
    
    try {
      return streamer.thumbnail_url
        .replace("{width}", "320")
        .replace("{height}", "180");
    } catch (error) {
      console.error('Error processing thumbnail URL:', error);
      return null;
    }
  };
  
  const thumbnailUrl = getThumbnailUrl();

  // Ensure we have an avatar, even without an image
  const getInitials = () => {
    if (!displayName) return "??";
    try {
      return displayName.substring(0, 2).toUpperCase();
    } catch (error) {
      return "??";
    }
  };

  // Create a safe route
  const profileRoute = `/streamers/${encodeURIComponent(username)}`;

  return (
    <Box
      maxW="sm"
      borderWidth="1px"
      borderRadius="lg"
      overflow="hidden"
      transition="transform 0.3s, box-shadow 0.3s"
      _hover={{
        transform: "translateY(-5px)",
        boxShadow: "xl",
      }}
      bg="#1f1f23"
      className="game-card"
    >
      <Link
        as={RouterLink}
        to={profileRoute}
        _hover={{ textDecoration: "none" }}
      >
        <Box position="relative">
          {thumbnailUrl ? (
            <Image 
              src={thumbnailUrl} 
              alt={displayName}
              width="100%"
              height="180px"
              objectFit="cover"
              fallbackSrc="https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=No+Preview"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://via.placeholder.com/320x180/1a1a2e/FFFFFF?text=No+Preview";
              }}
            />
          ) : (
            <Box 
              width="100%" 
              height="180px" 
              bg="gray.800" 
              display="flex" 
              alignItems="center" 
              justifyContent="center"
            >
              <Text color="gray.400">No Preview Available</Text>
            </Box>
          )}
          
          {isLive && (
            <Badge
              position="absolute"
              top="10px"
              left="10px"
              colorScheme="red"
              variant="solid"
              px={2}
              py={1}
              borderRadius="md"
            >
              LIVE
            </Badge>
          )}
          
          {isLive && viewerCount > 0 && (
            <Badge
              position="absolute"
              bottom="10px"
              left="10px"
              colorScheme="blackAlpha"
              bg="rgba(0,0,0,0.7)"
              px={2}
              py={1}
              borderRadius="md"
            >
              {formatViewers(viewerCount)} viewers
            </Badge>
          )}
        </Box>

        <Box p={4}>
          <Box display="flex" alignItems="center" mb={2}>
            <Avatar 
              src={profileImage} 
              name={getInitials()} 
              size="sm" 
              mr={2} 
              bg="purple.500"
              onError={(e) => {
                // Force use of initials if image fails
                e.target.onerror = null;
                e.target.src = "";
              }}
            />
            <Heading
              as="h3"
              size="md"
              isTruncated
              title={displayName}
            >
              {displayName}
            </Heading>
          </Box>

          {isLive ? (
            <>
              <Text
                color="gray.300"
                fontSize="sm"
                mb={1}
                noOfLines={1}
                title={gameName}
              >
                {gameName}
              </Text>
              <Text
                color="gray.400"
                fontSize="sm"
                noOfLines={2}
                title={streamTitle}
              >
                {streamTitle}
              </Text>
            </>
          ) : (
            <Text color="gray.400" fontSize="sm">
              Offline
            </Text>
          )}
        </Box>
      </Link>
    </Box>
  );
}

export default GameCard; 