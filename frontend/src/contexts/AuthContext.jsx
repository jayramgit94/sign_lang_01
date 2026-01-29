import axios from "axios";
import httpStatus from "http-status";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import server from "../environment";
import { AuthContext } from "./AuthContextType";

const client = axios.create({
  baseURL: `${server}/api/v1/user`,
});

export const AuthProvider = ({ children }) => {
  const [userData, setUserData] = useState({});

  const router = useNavigate();

  const handleRegister = async (name, username, password) => {
    try {
      let request = await client.post("/register", {
        name: name,
        username: username,
        password: password,
      });

      if (request.status === httpStatus.CREATED) {
        return { success: true, message: request.data.message };
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.message ||
        "Registration failed. Please try again.";
      console.error("Registration error:", errorMsg);
      return { success: false, message: errorMsg };
    }
  };

  const handleLogin = async (username, password) => {
    try {
      let request = await client.post("/login", {
        username: username,
        password: password,
      });

      if (request.status === httpStatus.OK) {
        localStorage.setItem("token", request.data.token);
        router("/home");
        return { success: true, message: "Login successful" };
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.message ||
        "Login failed. Please check your credentials.";
      console.error("Login error:", errorMsg);
      return { success: false, message: errorMsg };
    }
  };

  const getHistoryOfUser = async () => {
    let request = await client.get("/get_all_activity", {
      params: {
        token: localStorage.getItem("token"),
      },
    });
    return request.data;
  };

  const addToUserHistory = async (meetingCode) => {
    let request = await client.post("/add_to_activity", {
      token: localStorage.getItem("token"),
      meeting_code: meetingCode,
    });
    return request;
  };

  const data = {
    userData,
    setUserData,
    addToUserHistory,
    getHistoryOfUser,
    handleRegister,
    handleLogin,
  };

  return <AuthContext.Provider value={data}>{children}</AuthContext.Provider>;
};

export { AuthContext };
