"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_1 = __importDefault(require("./routes/auth"));
const profile_1 = __importDefault(require("./routes/profile"));
const chats_1 = __importDefault(require("./routes/chats"));
const users_1 = __importDefault(require("./routes/users"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const stories_1 = __importDefault(require("./routes/stories"));
const storage_1 = __importDefault(require("./routes/storage"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/profile', profile_1.default);
app.use('/api/chats', chats_1.default);
app.use('/api/users', users_1.default);
app.use('/api/sessions', sessions_1.default);
app.use('/api/stories', stories_1.default);
app.use('/api/storage', storage_1.default);
// Serve uploads statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../public/uploads')));
// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});
// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
exports.default = app;
