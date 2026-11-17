/*
=====================================================================
 META LEADS MOBILE APP (EXPO / REACT NATIVE) - OVERVIEW
=====================================================================
 Goal: Show leads coming from your backend (server.js) on the phone,
 and update the list LIVE when a new lead arrives.

 How it works:
 1. When the app opens, it connects to the backend using Socket.IO.
 2. Once connected, it also calls GET /leads to load existing leads.
 3. Whenever the backend emits "lead:new", the app adds that lead
    to the TOP of the list instantly (no refresh needed).
 4. A status text shows "Live connected" (green) or "Disconnected" (red).
 5. Leads are displayed as cards inside a FlatList.

 Duplicate protection: the same lead can arrive from more than one
 place (REST call + socket event), so the code always checks the lead
 ID before adding it.
=====================================================================
*/

// useState -> stores data that changes (leads, connection status).
// useEffect -> runs code when the screen loads (connect to server).
import React, { useEffect, useState } from "react";

// Basic React Native building blocks.
import {
  View,               // Container (like <div>)
  Text,               // Shows text
  FlatList,           // Efficient scrolling list
  StyleSheet,         // Creates styles
  ActivityIndicator,  // Loading spinner
  SafeAreaView        // Keeps content away from notches/status bar
} from "react-native";

// Socket.IO client library to talk to the backend in real time.
import { io } from "socket.io-client";

// Address of your backend. Here it is an ngrok tunnel that forwards
// to the Node server running on your computer.
// NOTE: free ngrok URLs change when ngrok restarts, so update this then.
const SERVER_URL = "https://canola-swaddling-stuffing.ngrok-free.dev";

export default function App() {
  // ---------------------- STATE ----------------------

  // Array of all leads shown on screen. Newest first.
  const [leads, setLeads] = useState([]);

  // true when the socket is connected to the server (controls status text).
  const [connected, setConnected] = useState(false);

  // true while the first load is happening (shows the spinner).
  const [loading, setLoading] = useState(true);

  // ---------------------- MAIN EFFECT ----------------------
  // The empty array [] at the end means: run ONCE when the app opens.
  useEffect(() => {
    // `active` becomes false when the screen closes. It stops us from
    // updating state after the component is gone (avoids warnings/bugs).
    let active = true;

    // Create the socket connection object.
    const socket = io(SERVER_URL, {
      autoConnect: false,                   // We connect manually later with socket.connect()
      reconnection: true,                   // Auto-retry if the connection drops
      transports: ["websocket", "polling"]  // Try WebSocket first, fall back to polling
    });

    // ---------------------- ADD ONE LEAD ----------------------
    // Called when a single new lead arrives (from "lead:new").
    function addLead(newLead) {
      // Ignore invalid data.
      if (!newLead || !newLead.id) return;

      // Use the functional form of setLeads so we always get the latest list.
      setLeads((previous) => {
        // If this lead is already in the list, do nothing (no duplicates).
        if (previous.some((lead) => String(lead.id) === String(newLead.id))) {
          return previous;
        }
        // Otherwise put the new lead at the TOP, followed by the old ones.
        return [newLead, ...previous];
      });
    }

    // ---------------------- LOAD ALL LEADS (REST) ----------------------
    // Fetches the full list from GET /leads on the backend.
    async function loadLeads() {
      try {
        const response = await fetch(`${SERVER_URL}/leads`);

        // If the server responded with an error status (404, 500...), throw.
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        // Convert the response body to JSON.
        const result = await response.json();

        // Support both response formats.
        // Format 1: the response itself is an array  -> [ {...}, {...} ]
        // Format 2: the array is inside result.data  -> { data: [ ... ] }
        // If neither, use an empty list.
        const leadList = Array.isArray(result)
          ? result
          : Array.isArray(result.data)
            ? result.data
            : [];

        // Only update state if the screen is still open.
        if (active) {
          setLeads((previous) => {
            // A Map keyed by lead ID automatically removes duplicates.
            const merged = new Map();

            // Step 1: add leads from the server.
            leadList.forEach((lead) => {
              if (lead && lead.id) {
                merged.set(String(lead.id), lead);
              }
            });

            // Step 2: add leads already on screen (e.g. ones that arrived
            // live through the socket). Same ID -> overwrites, no duplicate.
            previous.forEach((lead) => {
              if (lead && lead.id) {
                merged.set(String(lead.id), lead);
              }
            });

            // Convert back to an array and reverse it so the newest is first.
            return Array.from(merged.values()).reverse();
          });
        }
      } catch (error) {
        // Network problem, server down, etc. Just log it; the app keeps running.
        console.log("Lead loading failed:", error.message);
      } finally {
        // Whether it worked or failed, stop showing the loading spinner.
        if (active) setLoading(false);
      }
    }

    // ---------------------- SOCKET EVENTS ----------------------

    // Fired when the connection to the server is established.
    socket.on("connect", () => {
      if (active) setConnected(true);   // Status becomes green
      loadLeads();                      // Reload leads (also catches ones missed while offline)
    });

    // Fired when the connection is lost.
    socket.on("disconnect", () => {
      if (active) setConnected(false);  // Status becomes red
    });

    // Fired when connecting fails (wrong URL, server off, ngrok expired...).
    socket.on("connect_error", (error) => {
      console.log("Socket connection error:", error.message);
      if (active) setConnected(false);
    });

    // Fired by the backend every time a new lead is received from Meta.
    // The lead object is passed straight to addLead().
    socket.on("lead:new", addLead);

    // Start the connection now that all listeners are set up.
    socket.connect();

    // Also load leads immediately, without waiting for the socket to connect.
    loadLeads();

    // ---------------------- CLEANUP ----------------------
    // Runs when the screen/app closes. Stops updates and closes the socket.
    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  // ---------------------- LEAD CARD UI ----------------------
  // FlatList calls this once for every lead. `item` is one lead object.
  function renderLead({ item }) {
    return (
      <View style={styles.card}>
        {/* Lead name, with a fallback if empty */}
        <Text style={styles.name}>{item.name || "New Lead"}</Text>

        {/* Email, or "Not provided" if the lead did not give one */}
        <Text style={styles.detail}>
          Email: {item.email || "Not provided"}
        </Text>

        {/* Phone, or "Not provided" */}
        <Text style={styles.detail}>
          Phone: {item.phone || "Not provided"}
        </Text>

        {/* Date/time of the lead. Supports both our format (createdAt)
            and Meta's original format (created_time). */}
        <Text style={styles.date}>
          {item.createdAt || item.created_time || ""}
        </Text>
      </View>
    );
  }

  // ---------------------- MAIN SCREEN UI ----------------------
  return (
    <SafeAreaView style={styles.container}>
      {/* Screen title */}
      <Text style={styles.heading}>Meta Leads</Text>

      {/* Connection status: green when connected, red when not.
          The array style merges the base style with a dynamic color. */}
      <Text style={[
        styles.status,
        { color: connected ? "#15803d" : "#dc2626" }
      ]}>
        {connected ? "● Live connected" : "● Disconnected"}
      </Text>

      {/* Show the spinner only during the first load */}
      {loading && <ActivityIndicator size="large" />}

      {/* Scrollable list of leads */}
      <FlatList
        data={leads}                                              // The array to display
        keyExtractor={(item, index) => String(item.id || index)}  // Unique key for each row
        renderItem={renderLead}                                   // How to draw each row
        contentContainerStyle={styles.list}                       // Padding around the list
        ListEmptyComponent={
          // Shown when the list is empty, but not while still loading.
          !loading ? (
            <Text style={styles.empty}>No leads received yet.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ---------------------- STYLES ----------------------
// StyleSheet.create is like CSS for React Native (uses camelCase names).
const styles = StyleSheet.create({
  // Whole screen: fills all space, light gray background, space at the top.
  container: {
    flex: 1,
    backgroundColor: "#f4f6f8",
    paddingTop: 32
  },
  // "Meta Leads" title.
  heading: {
    fontSize: 26,
    fontWeight: "bold",
    marginHorizontal: 20
  },
  // Connected/Disconnected text (color is set dynamically above).
  status: {
    fontSize: 14,
    margin: 20
  },
  // Padding inside the scrolling list.
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  // One lead card: white box, rounded corners, small shadow (elevation is Android shadow).
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2
  },
  // Lead name inside the card.
  name: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8
  },
  // Email and phone lines.
  detail: {
    fontSize: 14,
    marginBottom: 5
  },
  // Date line: small and gray.
  date: {
    fontSize: 12,
    color: "#777",
    marginTop: 8
  },
  // "No leads received yet." message.
  empty: {
    textAlign: "center",
    marginTop: 50,
    color: "#777"
  }
});