import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** How many replicas the Shop CRD asks for: `standard` 2, `high` 3. */
export enum ShopAvailability {
  STANDARD = 'standard',
  HIGH = 'high',
}

/** Which operator provisions the shop's database. */
export enum ShopDatabase {
  POSTGRESQL = 'postgresql',
  REDIS = 'redis',
}

/**
 * Columns are exactly the fields of the Shop CRD the shop-operator reconciles, 
 * so a row here is the desired state and the cluster is what follows it.
 */
@Entity('shops')
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Chosen when the shop is created; the cluster resources are named after it. */
  @Column({ length: 64 })
  name: string;

  /**
   * Name of the Shop resource inside the cluster, derived from `name`.
   */
  @Column({ unique: true, length: 40 })
  slug: string;

  @Column({ type: 'enum', enum: ShopAvailability })
  availability: ShopAvailability;

  @Column({ name: 'wallet_address', length: 128 })
  walletAddress: string;

  @Column({ type: 'enum', enum: ShopDatabase })
  database: ShopDatabase;

  /** Where the deployed site answers; null until the cluster reports it. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  url: string | null;

  /** Deleting the account takes its shop sites with it. */
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
