import {
  users,
  influencerPreferences,
  inquiries,
  messages,
  businessProfiles,
  campaigns,
  type User,
  type UpsertUser,
  type InfluencerPreferences,
  type InsertInfluencerPreferences,
  type Inquiry,
  type InsertInquiry,
  type Message,
  type InsertMessage,
  type BusinessProfile,
  type InsertBusinessProfile,
  type Campaign,
  type InsertCampaign,
} from "../../shared/schema.js";
import { db } from "./db.js";
import { eq, and, or, desc, isNotNull, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string, userType?: User["userType"]): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(user: UpsertUser): Promise<User>;
  updateUsername(userId: string, username: string): Promise<User>;
  updateLanguagePreference(userId: string, language: string): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<User>;
  getBusinessProfile(userId: string): Promise<BusinessProfile | undefined>;
  upsertBusinessProfile(profile: InsertBusinessProfile): Promise<BusinessProfile>;
  getCampaignsByBusiness(businessId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaignStatus(id: string, status: "processing" | "waiting_approval" | "negotiating" | "waiting_response" | "deal" | "denied"): Promise<Campaign>;
  getOldestProcessingCampaign(businessId: string): Promise<Campaign | undefined>;
  saveCampaignSearchResult(
    id: string,
    data: {
      status: "processing" | "waiting_approval";
      searchCriteria?: string | null;
      matchedInfluencers?: unknown;
    },
  ): Promise<Campaign>;
  
  // Influencer preferences
  getInfluencerPreferences(userId: string): Promise<InfluencerPreferences | undefined>;
  upsertInfluencerPreferences(prefs: InsertInfluencerPreferences): Promise<InfluencerPreferences>;
  
  // Inquiries
  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  getInquiriesByInfluencer(influencerId: string): Promise<Inquiry[]>;
  getInquiriesByBusiness(businessId: string): Promise<Inquiry[]>;
  getInquiry(id: string): Promise<Inquiry | undefined>;
  updateInquiryStatus(id: string, status: "pending" | "approved" | "rejected" | "needs_info", aiResponse?: string): Promise<Inquiry>;
  closeInquiryChat(id: string, aiRecommendation: string): Promise<Inquiry>;
  updateLastBusinessMessage(id: string): Promise<void>;
  getIdleOpenInquiries(threshold: Date): Promise<Inquiry[]>;
  deleteInquiry(id: string): Promise<void>;
  
  // Messages
  getMessagesByInquiry(inquiryId: string): Promise<Message[]>;
  addMessage(message: InsertMessage): Promise<Message>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string, userType?: User["userType"]): Promise<User | undefined> {
    const conditions = [eq(users.email, email)];
    if (userType) {
      conditions.push(eq(users.userType, userType));
    }
    const [user] = await db
      .select()
      .from(users)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUsername(userId: string, username: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateLanguagePreference(userId: string, language: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ languagePreference: language, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getBusinessProfile(userId: string): Promise<BusinessProfile | undefined> {
    const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
    return profile;
  }

  async upsertBusinessProfile(profile: InsertBusinessProfile): Promise<BusinessProfile> {
    const [result] = await db
      .insert(businessProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: businessProfiles.userId,
        set: {
          ...profile,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getCampaignsByBusiness(businessId: string): Promise<Campaign[]> {
    return await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.businessId, businessId))
      .orderBy(desc(campaigns.createdAt));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [result] = await db.insert(campaigns).values({ ...campaign, status: "processing" }).returning();
    return result;
  }

  async updateCampaignStatus(id: string, status: "processing" | "waiting_approval" | "negotiating" | "waiting_response" | "deal" | "denied"): Promise<Campaign> {
    const [result] = await db
      .update(campaigns)
      .set({ status, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return result;
  }

  async getOldestProcessingCampaign(businessId: string): Promise<Campaign | undefined> {
    const [result] = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.businessId, businessId),
          eq(campaigns.status, "processing"),
        ),
      )
      .orderBy(campaigns.createdAt)
      .limit(1);
    return result;
  }

  async saveCampaignSearchResult(
    id: string,
    data: {
      status: "processing" | "waiting_approval";
      searchCriteria?: string | null;
      matchedInfluencers?: unknown;
    },
  ): Promise<Campaign> {
    const [result] = await db
      .update(campaigns)
      .set({
        status: data.status,
        searchCriteria: data.searchCriteria ?? null,
        matchedInfluencers: data.matchedInfluencers ?? null,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();
    return result;
  }

  // Influencer preferences
  async getInfluencerPreferences(userId: string): Promise<InfluencerPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(influencerPreferences)
      .where(eq(influencerPreferences.userId, userId));
    return prefs;
  }

  async upsertInfluencerPreferences(prefs: InsertInfluencerPreferences): Promise<InfluencerPreferences> {
    const [result] = await db
      .insert(influencerPreferences)
      .values(prefs)
      .onConflictDoUpdate({
        target: influencerPreferences.userId,
        set: {
          ...prefs,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Inquiries
  async createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    const [result] = await db
      .insert(inquiries)
      .values({ ...inquiry, lastBusinessMessageAt: new Date() })
      .returning();
    return result;
  }

  async getInquiriesByInfluencer(influencerId: string): Promise<Inquiry[]> {
    return await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.influencerId, influencerId))
      .orderBy(desc(inquiries.createdAt));
  }

  async getInquiriesByBusiness(businessId: string): Promise<Inquiry[]> {
    return await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.businessId, businessId))
      .orderBy(desc(inquiries.createdAt));
  }

  async getInquiry(id: string): Promise<Inquiry | undefined> {
    const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, id));
    return inquiry;
  }

  async updateInquiryStatus(
    id: string,
    status: "pending" | "approved" | "rejected" | "needs_info",
    aiResponse?: string
  ): Promise<Inquiry> {
    const [result] = await db
      .update(inquiries)
      .set({ status, aiResponse, updatedAt: new Date() })
      .where(eq(inquiries.id, id))
      .returning();
    return result;
  }

  async closeInquiryChat(id: string, aiRecommendation: string): Promise<Inquiry> {
    const [result] = await db
      .update(inquiries)
      .set({ chatActive: false, aiRecommendation, updatedAt: new Date() })
      .where(eq(inquiries.id, id))
      .returning();
    return result;
  }

  async updateLastBusinessMessage(id: string): Promise<void> {
    await db
      .update(inquiries)
      .set({ lastBusinessMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(inquiries.id, id));
  }

  async getIdleOpenInquiries(threshold: Date): Promise<Inquiry[]> {
    return await db
      .select()
      .from(inquiries)
      .where(
        and(
          eq(inquiries.chatActive, true),
          isNotNull(inquiries.lastBusinessMessageAt),
          lte(inquiries.lastBusinessMessageAt, threshold),
        )
      )
      .orderBy(desc(inquiries.lastBusinessMessageAt));
  }

  async deleteInquiry(id: string): Promise<void> {
    await db.delete(inquiries).where(eq(inquiries.id, id));
  }

  // Messages
  async getMessagesByInquiry(inquiryId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.inquiryId, inquiryId))
      .orderBy(messages.createdAt);
  }

  async addMessage(message: InsertMessage): Promise<Message> {
    const [result] = await db.insert(messages).values(message).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
