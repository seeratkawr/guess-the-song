import { io } from 'socket.io-client';

const URL = "http://localhost:8080"; // for development

export const socket = io(URL);