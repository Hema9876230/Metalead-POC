
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView
} from "react-native";

import { io } from "socket.io-client";

const SERVER_URL = "https://canola-swaddling-stuffing.ngrok-free.dev";

export default function App() {
  const [leads, setLeads] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      transports: ["websocket", "polling"]
    });

    function addLead(newLead) {
      if (!newLead || !newLead.id) return;

      setLeads((previous) => {
        if (previous.some((lead) => String(lead.id) === String(newLead.id))) {
          return previous;
        }
        return [newLead, ...previous];
      });
    }

    async function loadLeads() {
      try {
        const response = await fetch(`${SERVER_URL}/leads`);

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const result = await response.json();

        // Support both response formats.
        const leadList = Array.isArray(result)
          ? result
          : Array.isArray(result.data)
            ? result.data
            : [];

        if (active) {
          setLeads((previous) => {
            const merged = new Map();

            leadList.forEach((lead) => {
              if (lead && lead.id) {
                merged.set(String(lead.id), lead);
              }
            });

            previous.forEach((lead) => {
              if (lead && lead.id) {
                merged.set(String(lead.id), lead);
              }
            });

            return Array.from(merged.values()).reverse();
          });
        }
      } catch (error) {
        console.log("Lead loading failed:", error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    socket.on("connect", () => {
      if (active) setConnected(true);
      loadLeads();
    });

    socket.on("disconnect", () => {
      if (active) setConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.log("Socket connection error:", error.message);
      if (active) setConnected(false);
    });

    socket.on("lead:new", addLead);

    socket.connect();
    loadLeads();

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  function renderLead({ item }) {
    return (
      <View style={styles.card}>
        <Text style={styles.name}>{item.name || "New Lead"}</Text>
        <Text style={styles.detail}>
          Email: {item.email || "Not provided"}
        </Text>
        <Text style={styles.detail}>
          Phone: {item.phone || "Not provided"}
        </Text>
        <Text style={styles.date}>
          {item.createdAt || item.created_time || ""}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Meta Leads</Text>

      <Text style={[
        styles.status,
        { color: connected ? "#15803d" : "#dc2626" }
      ]}>
        {connected ? "● Live connected" : "● Disconnected"}
      </Text>

      {loading && <ActivityIndicator size="large" />}

      <FlatList
        data={leads}
        keyExtractor={(item, index) => String(item.id || index)}
        renderItem={renderLead}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No leads received yet.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6f8",
    paddingTop: 32
  },
  heading: {
    fontSize: 26,
    fontWeight: "bold",
    marginHorizontal: 20
  },
  status: {
    fontSize: 14,
    margin: 20
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2
  },
  name: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8
  },
  detail: {
    fontSize: 14,
    marginBottom: 5
  },
  date: {
    fontSize: 12,
    color: "#777",
    marginTop: 8
  },
  empty: {
    textAlign: "center",
    marginTop: 50,
    color: "#777"
  }
});
