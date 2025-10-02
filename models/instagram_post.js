const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const InstagramPost = sequelize.define('InstagramPost', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  caption: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  media_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  media_type: {
    type: DataTypes.ENUM('image', 'video', 'carousel'),
    defaultValue: 'image',
    allowNull: false,
  },
  hashtags: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  mentions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Post status
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'published', 'failed'),
    defaultValue: 'draft',
    allowNull: false,
  },
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  instagram_post_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Creator info
  created_by: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  updated_by: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Analytics
  likes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  comments_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  shares_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  reach_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  impressions_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
}, {
  tableName: 'instagram_posts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = InstagramPost;
