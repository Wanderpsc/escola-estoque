import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        try {
          const user = await db.user.findUnique({
            where: { email },
            include: { school: true },
          });

          if (!user || !user.active) return null;

          const passwordMatch = await bcrypt.compare(password, user.password);
          if (!passwordMatch) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            schoolName: user.school?.name ?? null,
          };
        } catch (err) {
          console.error("[authorize] ERROR:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as any).role as string;
        token.schoolId = (user as any).schoolId as string | null;
        token.schoolName = (user as any).schoolName as string | null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).schoolId = token.schoolId as string | null;
        (session.user as any).schoolName = token.schoolName as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24h
  },
  secret: process.env.AUTH_SECRET,
});
