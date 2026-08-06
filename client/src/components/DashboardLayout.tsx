import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { FilePenLine, Home, LogOut, Newspaper } from "lucide-react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [{ icon: FilePenLine, label: "Articles", path: "/admin" }];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-[#fffdf9] px-6"><div className="w-full max-w-sm text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-stone-950 text-xs font-bold tracking-[.16em] text-white">N</span><h1 className="mt-7 font-display text-4xl tracking-[-.05em] text-stone-950">Sign in to continue.</h1><p className="mt-4 text-sm leading-6 text-stone-500">The editorial workspace is available to authenticated administrators.</p><Button onClick={() => startLogin()} className="mt-8 w-full bg-stone-950 text-white hover:bg-stone-800">Sign in</Button><Link href="/" className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-stone-500 hover:text-stone-950"><Home className="h-3.5 w-3.5" /> Return to newsroom</Link></div></div>;
  }
  if (user.role !== "admin") {
    return <div className="flex min-h-screen items-center justify-center bg-[#fffdf9] px-6"><div className="w-full max-w-sm text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-stone-950 text-xs font-bold tracking-[.16em] text-white">N</span><h1 className="mt-7 font-display text-4xl tracking-[-.05em] text-stone-950">Administrator access required.</h1><p className="mt-4 text-sm leading-6 text-stone-500">Your account is signed in but is not authorized to manage newsroom content.</p><Link href="/" className="mt-8 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-stone-500 hover:text-stone-950"><Home className="h-3.5 w-3.5" /> Return to newsroom</Link></div></div>;
  }
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  return <SidebarProvider><Sidebar collapsible="icon" className="border-r border-sidebar-border"><SidebarHeader className="h-[72px] justify-center"><Link href="/" className="flex items-center gap-3 px-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1dfae] text-[11px] font-bold tracking-[.16em] text-stone-900">N</span><span className="font-display text-xl tracking-[-.04em] text-sidebar-foreground group-data-[collapsible=icon]:hidden">Newsroom</span></Link></SidebarHeader><SidebarContent className="px-3 pt-5"><p className="px-2 pb-3 text-[10px] font-bold uppercase tracking-[.16em] text-stone-400 group-data-[collapsible=icon]:hidden">Editorial</p><SidebarMenu>{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"><Avatar className="h-9 w-9 border border-white/10"><AvatarFallback className="bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">{user?.name?.charAt(0).toUpperCase() || "A"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium text-sidebar-foreground">{user?.name || "Administrator"}</p><p className="mt-0.5 truncate text-xs text-stone-400">Administrator</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><SidebarInset className="min-w-0 bg-[#f7f5f0]">{isMobile ? <div className="flex h-14 items-center border-b border-stone-200 bg-[#fffdf9] px-3"><SidebarTrigger className="h-9 w-9" /><span className="ml-2 font-display text-xl">Newsroom</span></div> : null}<main className="min-h-screen p-4 sm:p-7 lg:p-9">{children}</main></SidebarInset></SidebarProvider>;
}
